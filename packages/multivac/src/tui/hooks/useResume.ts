import { useCallback } from "react";
import { useApp } from "ink";
import type { ResultRow, ResumeAction } from "../../core/types.js";
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

export function useResume(opts: Opts) {
  const { exit } = useApp();
  return useCallback(
    (action: ResumeAction, row: ResultRow) => {
      const source = getSource(row.source);
      if (!source?.resume) {
        exit();
        return;
      }
      const result = source.resume.spawn(row, action, {
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
