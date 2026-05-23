import * as fs from "node:fs";
import * as path from "node:path";
import * as childProc from "node:child_process";
import type { InstallResult } from "../types.js";

export const INIT_MARKETPLACE = "krmrn42/krmrn-skills";
export const INIT_PLUGIN = "chat-search@krmrn-skills";

export function claudeOnPath(): boolean {
  const PATH = process.env.PATH || "";
  const pathSep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of PATH.split(pathSep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, "claude" + ext);
      try {
        if (fs.statSync(candidate).isFile()) return true;
      } catch (_) {
        // ENOENT, EACCES — skip
      }
    }
  }
  return false;
}

export function printManualInstall(): string {
  return (
    "Claude Code (`claude`) not on $PATH.\n" +
    "\n" +
    "To install manually, paste into a Claude Code session:\n" +
    "\n" +
    `/plugin marketplace add ${INIT_MARKETPLACE}\n` +
    `/plugin install ${INIT_PLUGIN}\n`
  );
}

export function detectAlreadyConfigured(stdout: string): boolean {
  // Heuristic: any 'already' (word-boundary) in stdout/stderr signals an
  // idempotent no-op such as 'marketplace already added' or 'plugin already
  // installed'. Picked deliberately over a strict allowlist so unknown-but-
  // similar wordings ('already present', 'already exists') keep working.
  return /already\b/i.test(stdout);
}

function runClaudeSubcommand(argv: string[], label: string): { ok: boolean; alreadyConfigured: boolean } {
  // The Claude Code CLI exposes plugin management as a `plugin` subcommand
  // (NOT a /plugin slash command — slash commands are REPL-only and invoking
  // them via argv prints "/plugin isn't available in this environment." and
  // exits 0, a silent-failure trap). See: `claude plugin --help`.
  //
  // Capture stdout/stderr so detectAlreadyConfigured can inspect them, then
  // tee back to the user terminal. spawnSync batches output — fine for the
  // short `plugin` subcommands; long-running children would need spawn() +
  // stream piping.
  const r = childProc.spawnSync("claude", argv, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const combined = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    process.stdout.write(`multivac init: ${label} — ok\n`);
    return { ok: true, alreadyConfigured: false };
  }
  if (detectAlreadyConfigured(combined)) {
    process.stdout.write(`multivac init: ${label} — already configured\n`);
    return { ok: true, alreadyConfigured: true };
  }
  process.stderr.write(
    `multivac init: ${label} failed (claude exited ${r.status}); see output above.\n`
  );
  return { ok: false, alreadyConfigured: false };
}

export async function runInit(): Promise<InstallResult> {
  if (!claudeOnPath()) {
    return { ok: true, message: printManualInstall() };
  }
  const marketplaceResult = runClaudeSubcommand(
    ["plugin", "marketplace", "add", INIT_MARKETPLACE],
    "plugin marketplace add"
  );
  if (!marketplaceResult.ok) {
    return { ok: false, message: `multivac init: plugin marketplace add failed` };
  }
  const installResult = runClaudeSubcommand(
    ["plugin", "install", INIT_PLUGIN],
    "plugin install"
  );
  if (!installResult.ok) {
    return { ok: false, message: `multivac init: plugin install failed` };
  }
  return { ok: true, message: "multivac init: chat-search plugin installed successfully" };
}
