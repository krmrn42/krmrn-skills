export type SourceId = string; // 'claude' | 'codex' | 'aider' | …

export type ResumeAction =
  | "resume"
  | "fork"
  | "dangerous"
  | "remote-control"
  | "tmux-window"
  | "newchat";                 // v0.8.1 — spawn `claude` in a dir without --resume

export interface MessageRow {
  id: string;                 // ${source}:${sessionId}:${uuid}:${blockIdx}
  source: SourceId;
  conversationId: string;
  projectPath: string;
  projectName: string;
  timestamp: number;
  type: "user" | "assistant" | "tool_use" | "tool_result" | "system";
  content: string;
  messageUuid: string;
  parentUuid: string | null;
  subtype?: string;            // v0.8: 'away_summary' for system rows; undefined otherwise
  gitBranch?: string;          // v0.8: extracted from JSONL top-level gitBranch
  attributionSkill?: string;   // v0.8: extracted from JSONL top-level attributionSkill
  isSubagent?: boolean;        // v0.8.1: true when the source JSONL was a subagent transcript
}

export interface ResultRow {
  kind: "chat";                 // v0.8.1 — discriminator for the Selectable union
  source: SourceId;
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: number;
  msgCount: number;
  snippet: string;
  score: number;
  title?: string | null;
  isPinned?: boolean;
  // v0.8 additions:
  recapText?: string;          // from getRecapText() — used in non-FTS browse
  gitBranch?: string | null;   // most recent git_branch seen in the conversation
  skill?: string | null;       // most recent attribution_skill seen
}

/**
 * A project group header. The picker groups chats by their project_path; each
 * group is preceded by one ProjectHeader. `chatCount` is the project's TOTAL
 * chat count (not the number of chats shown in this group's slice).
 * Selectable; `Enter` on a project header spawns `claude` (no --resume) in
 * `projectPath`.
 */
export interface ProjectHeader {
  kind: "project";
  projectPath: string;
  projectName: string;
  chatCount: number;
  lastActivity: number;
  topChatTitles: string[];      // up to 3, for the project header's secondary line
}

/**
 * Tail-of-group footer indicating "Y more chats in this project". Cosmetic;
 * cursor skips it on ↑/↓ navigation. Per spec §D4.
 */
export interface MoreRow {
  kind: "more";
  projectPath: string;
  remainingCount: number;        // chatCount − chats shown in this project's group
}

export type Selectable = ResultRow | ProjectHeader | MoreRow;

export interface SessionStore {
  version: number;
  names: Record<string, string>; // key: ${source}:${sessionId}
  pins: string[];                // values: ${source}:${sessionId}
}

export interface Args {
  query: string;
  interactive: boolean;
  list: boolean;
  regex: string | null;
  regexCompiled: RegExp | null;
  scan: boolean;
  includeTools: boolean;
  onlyUser: boolean;
  project: string | null;
  since: string | null;
  sinceTs: number;
  limit: number;
  format: "text" | "tsv" | "markdown" | null; // markdown: v0.8.1 default for --list
  dbPath: string;
  preview: string | null;
  noColor: boolean;
  help: boolean;
  reindex: boolean;
  indexStatus: boolean;
  dangerouslySkipPermissions: boolean;
  printNames: boolean;
  unpinAll: boolean;
  noTmux: boolean;
  literalQuery: boolean;
}
