import { useCallback } from "react";
import { useApp } from "ink";
import type { ResultRow, ResumeAction, ProjectHeader } from "../../core/types.js";
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
 * Build a ResultRow-shaped object from a ProjectHeader so the existing
 * source.resume.spawn(row, action, opts) interface keeps working for the
 * "newchat" action. The synthetic row has an empty sessionId —
 * buildClaudeArgs ignores it for newchat.
 */
function projectAsRow(proj: ProjectHeader): ResultRow {
  return {
    kind: "chat",
    source: "claude",
    sessionId: "",
    projectPath: proj.projectPath,
    projectName: proj.projectName,
    lastActivity: proj.lastActivity,
    msgCount: 0,
    snippet: "",
    score: 0,
  };
}

export function useResume(opts: Opts) {
  const { exit } = useApp();
  return useCallback(
    (action: ResumeAction, row: ResultRow | ProjectHeader) => {
      const resolved: ResultRow = row.kind === "project" ? projectAsRow(row) : row;
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
