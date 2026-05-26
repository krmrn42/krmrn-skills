import * as fs from "node:fs";
import * as path from "node:path";
import * as childProc from "node:child_process";
import type { ResultRow, ResumeAction } from "../../core/types.js";
import type { ResumeOpts, SpawnResult } from "../types.js";
import { EXIT_ENV, EXIT_INTERNAL } from "../../cli/exit-codes.js";

export function shellQuote(s: string): string {
  if (s === "" || /[^A-Za-z0-9_./@:+\-=,%]/.test(s)) {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  return s;
}

export function resumeOneLiner(row: ResultRow): string {
  const { sessionId, projectPath } = row;
  if (!projectPath) {
    return `claude --resume ${sessionId}  # original project path unknown`;
  }
  return `(cd ${shellQuote(projectPath)} && claude --resume ${sessionId})`;
}

// buildClaudeArgs is the single source of truth for the argv passed to
// `claude` when spawned. Action-aware: savedName lands in different positions
// depending on `action`. A naive "if savedName, prepend --name" helper would
// produce the wrong shape for remote-control, which consumes the name via its
// own positional argument.
//
// Actions:
//   - "resume"         → ["--resume", id] (+ --name when set)
//   - "fork"           → ["--fork-session", "--resume", id] (+ --name)
//   - "dangerous"      → ["--dangerously-skip-permissions", "--resume", id] (+ --name)
//   - "remote-control" → ["--remote-control", name?, "--resume", id]  (NO --name)
export function buildClaudeArgs(action: ResumeAction, row: ResultRow, savedName: string | null): string[] {
  const id = row.sessionId;
  const name = typeof savedName === "string" && savedName.length > 0 ? savedName : null;
  if (action === "remote-control") {
    // --remote-control consumes the name semantically; --name is suppressed.
    return name
      ? ["--remote-control", name, "--resume", id]
      : ["--remote-control", "--resume", id];
  }
  const namePart = name ? ["--name", name] : [];
  if (action === "fork") return ["--fork-session", ...namePart, "--resume", id];
  if (action === "dangerous") {
    return ["--dangerously-skip-permissions", ...namePart, "--resume", id];
  }
  // Default action: plain "resume".
  return [...namePart, "--resume", id];
}

const _projectDirCache = new Map<string, boolean>();
export function isExistingDir(p: string): boolean {
  if (!p) return false;
  if (_projectDirCache.has(p)) return _projectDirCache.get(p)!;
  let ok = false;
  try {
    ok = fs.statSync(p).isDirectory();
  } catch (_) {
    ok = false;
  }
  _projectDirCache.set(p, ok);
  return ok;
}

export function spawnClaude(row: ResultRow, action: ResumeAction, opts: ResumeOpts): SpawnResult {
  const projectPath = row.projectPath;
  let cwd = process.cwd();
  if (projectPath) {
    if (isExistingDir(projectPath)) {
      cwd = projectPath;
    } else {
      process.stderr.write(
        `multivac: project path '${projectPath}' is not a directory; resuming in current cwd. ` +
          `claude --resume may fail to find the session.\n`
      );
    }
  } else {
    process.stderr.write(
      "multivac: this conversation has no recorded project path; " +
        "resuming in current cwd. claude --resume may fail.\n"
    );
  }
  const claudeArgs = buildClaudeArgs(action, row, opts.savedName);
  const result = childProc.spawnSync("claude", claudeArgs, {
    stdio: "inherit",
    cwd,
  });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        "multivac: `claude` not found on PATH. " +
          "Install Claude Code or ensure `claude` is on your PATH.\n"
      );
      return { status: EXIT_ENV };
    }
    process.stderr.write(`multivac: spawning claude failed: ${result.error.message}\n`);
    return { status: EXIT_INTERNAL };
  }
  return { status: result.status ?? EXIT_INTERNAL };
}

