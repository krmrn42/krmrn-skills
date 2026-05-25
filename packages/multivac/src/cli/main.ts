import { render } from "ink";
import React from "react";
import * as fs from "node:fs";
import { parseArgs, selectMode, buildHelp } from "./args.js";
import { validateArgs } from "./validate.js";
import { EXIT_OK, EXIT_USER, EXIT_ENV, EXIT_INTERNAL, dieUser, dieEnv } from "./exit-codes.js";
import { openDb, probeSchema, detectTimestampScale, isPluginOwnedDb } from "../core/db.js";
import { ensureSchema, runMigrations } from "../indexer/state.js";
import { runIndexer, fullReindex } from "../indexer/runner.js";
import { getIndexStatus, renderIndexStatus } from "../indexer/status.js";
import { loadSessionStore, saveSessionStore, sessionsConfigPath } from "../core/sessions.js";
import { ftsSearch } from "../core/search/fts.js";
import { regexPostfilter, regexScan } from "../core/search/regex.js";
import { renderText } from "../core/render/text.js";
import { renderTsv } from "../core/render/tsv.js";
import { renderPreview } from "../core/render/preview.js";
import { runInit } from "../sources/claude/install.js";
import { projectsRoot, listJsonlFiles } from "../sources/claude/discover.js";
import { App } from "../tui/App.js";
import { getDesiredExitCode, resetDesiredExitCode } from "../tui/hooks/useResume.js";
import { recentConversations, isWrapperContent, synthesizeTitle, normalizeTailContent, WRAPPER_TAGS } from "../core/search/recent.js";
import { applyPinOrdering } from "../core/search/pin-ordering.js";
import { emptySessionStore } from "../core/sessions.js";
import { detectAlreadyConfigured } from "../sources/claude/install.js";
import { buildClaudeArgs } from "../sources/claude/resume.js";
import { sanitizeTmuxName, shellSingleQuote, buildTmuxNewWindowCommand } from "../sources/claude/tmux.js";
import { BINDINGS, buildStatusBar } from "../tui/state/keybindings.js";

// Test-only exports. Guarded so production behavior is unaffected; the tests
// in ../test/multivac.test.sh set MULTIVAC_TEST=1 before importing this file.
if (process.env.MULTIVAC_TEST) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const testExports: any = {
    // Original JS exports (parity with multivac.js MULTIVAC_TEST block)
    parseArgs,
    selectMode,
    buildHelp,
    recentConversations,
    isWrapperContent,
    synthesizeTitle,
    normalizeTailContent,
    WRAPPER_TAGS,
    sessionsConfigPath,
    loadSessionStore,
    saveSessionStore,
    emptySessionStore,
    applyPinOrdering,
    detectAlreadyConfigured,
    // TS-specific helpers exposed via ._test (were in picker.js in legacy JS)
    _test: {
      buildClaudeArgs,
      sanitizeTmuxName,
      shellSingleQuote,
      buildTmuxNewWindowCommand,
      BINDINGS,
      buildStatusBar,
    },
  };
  (globalThis as any).__multivac_test_exports__ = testExports;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  // parseArgs handles --help / --version internally and exits.  If args.help is
  // still true after returning, write help and exit (defensive — should not happen).
  if (args.help) {
    process.stdout.write(buildHelp() + "\n");
    return EXIT_OK;
  }

  validateArgs(args);

  // Reserved subcommand: `multivac init` routes through Claude's install hook
  // (unless `--` literal-query escape was used).
  if (!args.literalQuery && args.query === "init") {
    const result = await runInit();
    process.stdout.write(result.message);
    if (!result.message.endsWith("\n")) process.stdout.write("\n");
    return result.ok ? EXIT_OK : EXIT_ENV;
  }

  // --print-names is a read-only short-circuit. No DB, no index work; just
  // dump the JSON file (or `{}` when none exists) and exit 0.
  if (args.printNames) {
    const p = sessionsConfigPath();
    let body: string;
    try {
      body = fs.readFileSync(p, "utf8");
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        process.stdout.write("{}\n");
        return EXIT_OK;
      }
      throw e;
    }
    if (!body.endsWith("\n")) body += "\n";
    process.stdout.write(body);
    return EXIT_OK;
  }

  // --unpin-all clears sessions.json.pins and exits. Leaves names untouched.
  if (args.unpinAll) {
    const store = loadSessionStore();
    const oldLen = store.pins.length;
    store.pins = [];
    saveSessionStore(store);
    process.stdout.write(`multivac: cleared ${oldLen} pin${oldLen === 1 ? "" : "s"}\n`);
    return EXIT_OK;
  }

  const usingPluginOwned = isPluginOwnedDb(args.dbPath);
  // Plugin-owned DB needs write access for the indexer pass that runs on every startup.
  const db = openDb(args.dbPath, { readWrite: usingPluginOwned });

  // For the plugin-owned index, ensure schema exists before probeSchema runs
  // against an otherwise-empty DB.
  if (usingPluginOwned) {
    runMigrations(db, false);
    ensureSchema(db);
  }

  probeSchema(db);

  // --index-status: short-circuit before any indexing or query work.
  if (args.indexStatus) {
    const status = await getIndexStatus(db, args.dbPath);
    process.stdout.write(renderIndexStatus(status));
    return EXIT_OK;
  }

  // Refresh / full-rebuild for the plugin-owned index.
  if (usingPluginOwned) {
    if (args.reindex) {
      await fullReindex(db);
    } else {
      await runIndexer(db);
    }

    // Empty index + empty disk = friendly nudge.
    const counts = db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number } | undefined;
    if (!counts || counts.c === 0) {
      const projects = projectsRoot();
      const files = await listJsonlFiles();
      if (files.length === 0) {
        dieEnv(
          `no past conversations on disk — use Claude Code at least once to populate ${projects}, ` +
            `or pass --db-path to a different SQLite FTS5 index.`
        );
      }
    }

    // --reindex without a query is a no-op exit after the rebuild.
    if (args.reindex && !args.query && !args.interactive && !args.preview) {
      const c = db
        .prepare(
          "SELECT COUNT(*) AS c, COUNT(DISTINCT conversation_id) AS conv, COUNT(DISTINCT project_path) AS proj FROM messages"
        )
        .get() as { c: number; conv: number; proj: number } | undefined;
      process.stderr.write(
        `multivac: indexed ${((c?.c) || 0).toLocaleString()} messages across ${((c?.conv) || 0).toLocaleString()} conversations / ${c?.proj || 0} projects\n`
      );
      return EXIT_OK;
    }
  } else if (args.reindex || args.indexStatus) {
    dieUser("--reindex and --index-status apply only to the plugin-owned index. Remove --db-path / MULTIVAC_DB to use them.");
  }

  args.sinceTs *= detectTimestampScale(db);

  const useColor = !!process.stdout.isTTY && !args.noColor;

  if (args.preview) {
    const row = db
      .prepare("SELECT source FROM messages WHERE conversation_id = ? LIMIT 1")
      .get(args.preview) as { source: string } | undefined;
    const src = row?.source ?? "claude";
    process.stdout.write(renderPreview(db, args.preview, src, useColor));
    return EXIT_OK;
  }

  const mode = selectMode(args, {
    stdinTTY: !!process.stdin.isTTY,
    stdoutTTY: !!process.stdout.isTTY,
  });

  if (mode === "picker") {
    // Ink requires raw mode which only works on a real TTY. When the user
    // explicitly passed -i but stdin/stdout are not TTYs (e.g., piped in a
    // script), die with a clear message rather than letting Ink crash with
    // an unhelpful "Raw mode is not supported" error.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write(
        "multivac: -i requires a TTY; for non-TTY callers use one-shot mode.\n"
      );
      return EXIT_ENV;
    }
    const sessionStore = loadSessionStore();
    const tmuxAvailable = !!process.env.TMUX && !args.noTmux;
    resetDesiredExitCode();
    const { waitUntilExit } = render(
      React.createElement(App, {
        db,
        args,
        sessionStore,
        dangerouslySkipPermissions: args.dangerouslySkipPermissions,
        tmuxAvailable,
      })
    );
    await waitUntilExit();
    const code = getDesiredExitCode();
    return code ?? EXIT_OK;
  }

  // One-shot: resolve default format now if the user didn't explicitly set it.
  if (args.format === null) {
    args.format = process.stdout.isTTY ? "text" : "tsv";
  }

  let results;
  if (args.scan) {
    if (!args.regexCompiled) dieUser("--scan requires --regex");
    results = regexScan(db, args, args.regexCompiled);
  } else if (args.regex) {
    if (!args.regexCompiled) dieUser("--regex pattern failed to compile");
    results = regexPostfilter(db, args, args.regexCompiled);
  } else {
    if (!args.query) {
      dieUser(
        "no query provided.\n" +
          'Try: multivac "some keyword"   (on a TTY, bare `multivac` opens the picker)\n' +
          "Run `multivac --help` for the full flag reference."
      );
    }
    results = ftsSearch(db, args);
  }

  if (args.format === "tsv") {
    process.stdout.write(renderTsv(results));
  } else {
    process.stdout.write(renderText(results, useColor));
  }

  return EXIT_OK;
}

if (!process.env.MULTIVAC_TEST) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e: any) => {
      if (e?.code === "SQLITE_READONLY") {
        process.stderr.write(`multivac: ${e.message}\n`);
        process.exit(EXIT_INTERNAL);
      }
      process.stderr.write(`multivac: internal error: ${e?.stack ?? e}\n`);
      process.exit(EXIT_INTERNAL);
    });
}
