import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { SourceFile } from "../types.js";
import type { MessageRow } from "../../core/types.js";

const TOOL_USE_INPUT_CAP = 8 * 1024;

const INDEXABLE_TYPES = new Set(["user", "assistant", "tool_result", "tool_use"]);

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
  type: "user" | "assistant" | "tool_use" | "tool_result";
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

  return [];
}

export async function* parse(file: SourceFile): AsyncGenerator<Omit<MessageRow, "id" | "source">> {
  const sessionId = path.basename(file.path, ".jsonl");
  const projectDir = path.basename(path.dirname(file.path));

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
    const projectPath = decodeProjectPathFromCwd(rec["cwd"], projectDir);
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
