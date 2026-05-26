import * as path from "node:path";
import * as childProc from "node:child_process";
import type { ResultRow } from "../../core/types.js";
import type { ResumeOpts, SpawnResult } from "../types.js";
import { EXIT_ENV, EXIT_INTERNAL } from "../../cli/exit-codes.js";
import { buildClaudeArgs, isExistingDir } from "./resume.js";

// sanitizeTmuxName strips control characters (tmux window-name slot can't
// render them) and truncates to 40 visible chars with a trailing ellipsis.
// Empty input falls back to "claude" so we always have a usable name.
export function sanitizeTmuxName(s: string): string {
  if (typeof s !== "string") return "claude";
  // eslint-disable-next-line no-control-regex
  let clean = s.replace(/[\x00-\x1f\x7f]/g, "");
  if (clean.length === 0) return "claude";
  if (clean.length > 40) clean = clean.slice(0, 39) + "…";
  return clean;
}

// shellSingleQuote wraps a string in POSIX single quotes, escaping internal
// single quotes the standard way (' → '\''). Used to build the inner shell
// command passed to `tmux new-window` as its last positional arg — tmux
// runs it via $SHELL -c so any user-supplied string must be quoted.
export function shellSingleQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// buildTmuxNewWindowCommand returns the argv for `tmux new-window …`.
// Window name resolution order: savedName → projectName → basename(projectPath)
// → "claude" (defensive default). The inner claude command reuses
// buildClaudeArgs so name passthrough stays in sync with non-tmux resume.
export function buildTmuxNewWindowCommand(row: ResultRow, opts: ResumeOpts): string[] {
  const savedName = opts.savedName ?? null;
  const nameSource =
    (savedName && savedName.length > 0 && savedName) ||
    (row.projectName && row.projectName.length > 0 && row.projectName) ||
    (row.projectPath && path.basename(row.projectPath)) ||
    "claude";
  const windowName = sanitizeTmuxName(nameSource);
  const cwd = row.projectPath || process.cwd();
  // Reuse buildClaudeArgs so --name passthrough and any future actions stay
  // consistent with the direct-spawn path. We shell-quote each piece for
  // safety; tmux invokes $SHELL -c on the joined string.
  const claudeArgs = buildClaudeArgs("resume", row, savedName);
  const innerCmd = ["claude", ...claudeArgs].map(shellSingleQuote).join(" ");
  return ["new-window", "-n", windowName, "-c", cwd, innerCmd];
}

export function spawnTmuxNewWindow(row: ResultRow, opts: ResumeOpts): SpawnResult {
  const tmuxArgs = buildTmuxNewWindowCommand(row, opts);
  if (row.projectPath && !isExistingDir(row.projectPath)) {
    process.stderr.write(
      `multivac: project path '${row.projectPath}' is not a directory; ` +
        "tmux new-window will fall back to its own cwd.\n"
    );
  }
  const result = childProc.spawnSync("tmux", tmuxArgs, { stdio: "inherit" });
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        "multivac: `tmux` not found on PATH. " +
          "Install tmux or run multivac outside a tmux session.\n"
      );
      return { status: EXIT_ENV };
    }
    process.stderr.write(`multivac: spawning tmux failed: ${result.error.message}\n`);
    return { status: EXIT_INTERNAL };
  }
  return { status: result.status ?? EXIT_INTERNAL };
}
