import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { SourceFile } from "../types.js";
import type { MessageRow } from "../../core/types.js";

const TOOL_USE_INPUT_CAP = 8 * 1024;

const INDEXABLE_TYPES = new Set(["user", "assistant", "tool_result", "tool_use", "system"]);

function decodeProjectPathFromCwd(cwd: unknown, fallbackDirName: string): string {
  if (cwd && typeof cwd === "string") return cwd;
  if (!fallbackDirName) return "";
  if (fallbackDirName.startsWith("-")) return "/" + fallbackDirName.slice(1).replace(/-/g, "/");
  return fallbackDirName;
}

function projectNameFromPath(projectPath: string): string {
  if (!projectPath) return "";
  const parts = projectPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function parseTimestampMs(s: unknown): number {
  if (!s) return 0;
  if (typeof s === "number") return s;
  if (typeof s === "string") {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function flattenContentString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const block of value) {
      if (block && typeof block === "object") {
        if (typeof (block as Record<string, unknown>).text === "string") parts.push((block as Record<string, unknown>).text as string);
        else if (typeof (block as Record<string, unknown>).content === "string") parts.push((block as Record<string, unknown>).content as string);
      } else if (typeof block === "string") {
        parts.push(block);
      }
    }
    return parts.join("\n");
  }
  return "";
}

function clipToolUseInput(input: unknown): string {
  let s: string;
  try {
    s = typeof input === "string" ? input : JSON.stringify(input);
  } catch (_) {
    s = String(input);
  }
  if (s.length > TOOL_USE_INPUT_CAP) s = s.slice(0, TOOL_USE_INPUT_CAP) + " …[truncated]";
  return s;
}

interface ParsedRow {
  type: "user" | "assistant" | "tool_use" | "tool_result" | "system";
  content: string;
  message_uuid: string;
  parent_uuid: string | null;
  block_idx: number;
}

function recordToRows(rec: Record<string, unknown>): ParsedRow[] | null {
  if (!rec || typeof rec !== "object") return [];
  const type = rec["type"] as string;
  // Unknown / uninteresting types: silent skip. Only types we *want* to index
  // count as malformed when missing required fields.
  if (!INDEXABLE_TYPES.has(type)) return [];
  if (!rec["sessionId"] || !rec["uuid"]) {
    return null; // parse-skip signal for a type we wanted but couldn't index
  }

  const baseUuid = rec["uuid"] as string;
  const parentUuid = (rec["parentUuid"] as string | undefined) || null;

  if (type === "user") {
    const message = rec["message"] as Record<string, unknown> | null | undefined;
    const content = flattenContentString(message && message["content"]);
    if (!content) return [];
    return [{ type: "user", content, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: 0 }];
  }

  if (type === "assistant") {
    const rows: ParsedRow[] = [];
    const message = rec["message"] as Record<string, unknown> | null | undefined;
    const blocks = message && message["content"];
    if (!Array.isArray(blocks)) {
      const flat = flattenContentString(blocks);
      if (flat) {
        rows.push({ type: "assistant", content: flat, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: 0 });
      }
      return rows;
    }
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i] as Record<string, unknown> | null | undefined;
      if (!b || typeof b !== "object") continue;
      if (b["type"] === "text" && typeof b["text"] === "string" && b["text"]) {
        rows.push({ type: "assistant", content: b["text"] as string, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: i });
      } else if (b["type"] === "thinking" && typeof b["thinking"] === "string" && b["thinking"]) {
        rows.push({ type: "assistant", content: b["thinking"] as string, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: i });
      } else if (b["type"] === "tool_use") {
        rows.push({ type: "tool_use", content: clipToolUseInput(b["input"]), message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: i });
      }
    }
    return rows;
  }

  if (type === "tool_result") {
    const message = rec["message"] as Record<string, unknown> | null | undefined;
    const content =
      flattenContentString(message && message["content"]) ||
      flattenContentString(rec["content"]);
    if (!content) return [];
    return [{ type: "tool_result", content, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: 0 }];
  }

  if (type === "system") {
    // Only away_summary is indexed; other system subtypes (hook_success,
    // skill_listing, mcp_instructions_delta, command_permissions, etc.) are
    // operational noise and silently skipped.
    if (rec["subtype"] !== "away_summary") return [];
    const content = typeof rec["content"] === "string" ? rec["content"] : "";
    if (!content) return [];
    return [{ type: "system" as const, content, message_uuid: baseUuid, parent_uuid: parentUuid, block_idx: 0 }];
  }

  return [];
}

/**
 * If `filePath` is a subagent JSONL (parent directory named "subagents"),
 * return the parent session's `cwd` field — read from the first record in the
 * sibling parent JSONL. Used to coerce subagent rows' `project_path` so
 * subdirectories don't manifest as phantom "projects" (spec §D15).
 *
 * Returns null when:
 *   - filePath is not a subagent JSONL, or
 *   - the parent JSONL is missing / unreadable, or
 *   - no record in the parent JSONL has a usable cwd.
 *
 * On null the caller falls back to the file's own cwd field, which is the
 * legacy behavior — safe.
 */
export function detectSubagentParentCwd(filePath: string): string | null {
  const dirName = path.basename(path.dirname(filePath));
  if (dirName !== "subagents") return null;
  // Path shape: .../projects/<encoded-cwd>/<conv-id>/subagents/agent-XXX.jsonl
  const subagentsDir = path.dirname(filePath);
  const convDir = path.dirname(subagentsDir);
  const convId = path.basename(convDir);
  const projectsDir = path.dirname(convDir);
  const parentJsonl = path.join(projectsDir, `${convId}.jsonl`);
  let text: string;
  try {
    text = fs.readFileSync(parentJsonl, "utf-8");
  } catch (_) {
    return null;
  }
  // Scan the first ~50 non-empty lines for one with a usable cwd; cap to keep
  // pathological inputs bounded.
  let scanned = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (++scanned > 50) break;
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      const cwd = rec["cwd"];
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch (_) {
      continue;
    }
  }
  return null;
}

export async function* parse(file: SourceFile): AsyncGenerator<Omit<MessageRow, "id" | "source">> {
  const sessionId = path.basename(file.path, ".jsonl");
  const projectDir = path.basename(path.dirname(file.path));

  // Project_path policy (spec §D15):
  //   - For a subagent JSONL, lock every row to the parent session's project
  //     path (read once from the parent's first cwd-carrying record).
  //   - For a top-level (non-subagent) JSONL, lock every row to THIS file's
  //     first cwd-carrying record. Per-message cwd is transient (it can shift
  //     when the controller invokes a subagent inside a subdir, or runs Bash
  //     commands that change directory). The session's project is defined by
  //     where the user STARTED Claude, which the first record records.
  //   - When no cwd is locked yet (file with no cwd records seen so far),
  //     fall back to the encoded directory name decode — lossy for paths with
  //     hyphens but a reasonable last-resort.
  const subagentCoercedCwd = detectSubagentParentCwd(file.path);
  const isSubagent = subagentCoercedCwd !== null
    || path.basename(path.dirname(file.path)) === "subagents";
  let sessionProjectPath: string | null = subagentCoercedCwd;

  const rl = readline.createInterface({
    input: fs.createReadStream(file.path, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch (_) {
      continue;
    }

    // Lock the session's project_path on the first record with a usable cwd.
    if (sessionProjectPath === null) {
      const recCwd = rec["cwd"];
      if (typeof recCwd === "string" && recCwd.length > 0) {
        sessionProjectPath = recCwd;
      }
    }
    const projectPath = sessionProjectPath
      ?? decodeProjectPathFromCwd(rec["cwd"], projectDir);
    const projectName = projectNameFromPath(projectPath);
    const ts = parseTimestampMs(rec["timestamp"]);
    const out = recordToRows(rec);
    if (out === null) {
      continue; // malformed record — skip
    }
    for (const r of out) {
      yield {
        conversationId: sessionId,
        projectPath,
        projectName,
        timestamp: ts,
        type: r.type,
        content: r.content,
        messageUuid: r.message_uuid,
        parentUuid: r.parent_uuid,
        subtype: r.type === "system" && typeof rec["subtype"] === "string"
          ? rec["subtype"]
          : undefined,
        gitBranch: typeof rec["gitBranch"] === "string" ? rec["gitBranch"] : undefined,
        attributionSkill: typeof rec["attributionSkill"] === "string" ? rec["attributionSkill"] : undefined,
        isSubagent,
      };
    }
  }
}

export {
  decodeProjectPathFromCwd,
  projectNameFromPath,
  parseTimestampMs,
  flattenContentString,
  clipToolUseInput,
  recordToRows,
  INDEXABLE_TYPES,
  TOOL_USE_INPUT_CAP,
};
