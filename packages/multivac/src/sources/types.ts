import type { MessageRow, ResultRow, SourceId, ResumeAction } from "../core/types.js";

export interface SourceFile {
  path: string;
  mtimeMs: number;
}

export interface ResumeOpts {
  savedName: string | null;
  tmuxAvailable: boolean;
  dangerouslySkipPermissions: boolean;
}

export interface SpawnResult {
  status: number;       // exit code to propagate (0..3)
  stderr?: string;      // optional diagnostic to write before exit
}

export interface InstallResult {
  ok: boolean;
  message: string;      // displayed to user
}

export interface ChatSource {
  readonly id: SourceId;
  readonly displayName: string;

  discover(): Promise<SourceFile[]>;
  parse(file: SourceFile): AsyncIterable<Omit<MessageRow, "id" | "source">>;

  readonly resume?: {
    actions: ResumeAction[];
    spawn(row: ResultRow, action: ResumeAction, opts: ResumeOpts): SpawnResult;
  };

  readonly install?: {
    run(): Promise<InstallResult>;
    manualInstructions(): string;
  };
}
