import { useCallback } from "react";
import { useApp } from "ink";
import type { ResultRow, ResumeAction, DirRow } from "../../core/types.js";
import { getSource } from "../../sources/registry.js";

interface Opts {
  savedName: string | null;
  tmuxAvailable: boolean;
  dangerouslySkipPermissions: boolean;
}

let desiredExitCode: number | null = null;
export function getDesiredExitCode(): number | null {
  return desiredExitCode;
}
export function resetDesiredExitCode(): void {
  desiredExitCode = null;
}

/**
 * Build a ResultRow-shaped object from a DirRow so the existing
 * source.resume.spawn(row, action, opts) interface keeps working for the
 * "newchat" action. The synthetic row has an empty sessionId — buildClaudeArgs
 * ignores it for newchat.
 */
function dirAsRow(dir: DirRow): ResultRow {
  return {
    kind: "chat",
    source: "claude",
    sessionId: "",
    projectPath: dir.projectPath,
    projectName: dir.projectName,
    lastActivity: dir.lastActivity,
    msgCount: 0,
    snippet: "",
    score: 0,
  };
}

export function useResume(opts: Opts) {
  const { exit } = useApp();
  return useCallback(
    (action: ResumeAction, row: ResultRow | DirRow) => {
      const resolved: ResultRow = row.kind === "dir" ? dirAsRow(row) : row;
      const source = getSource(resolved.source);
      if (!source?.resume) {
        exit();
        return;
      }
      const result = source.resume.spawn(resolved, action, {
        savedName: opts.savedName,
        tmuxAvailable: opts.tmuxAvailable,
        dangerouslySkipPermissions: opts.dangerouslySkipPermissions,
      });
      if (result.stderr) process.stderr.write(result.stderr);
      desiredExitCode = result.status;
      exit();
    },
    [opts.savedName, opts.tmuxAvailable, opts.dangerouslySkipPermissions, exit],
  );
}
