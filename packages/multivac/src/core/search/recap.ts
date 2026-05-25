import type { DatabaseSync } from "node:sqlite";

const RECAP_MAX_LINES = 5;

/**
 * Resolve the "recap" text for a conversation, used in row preview lines and
 * preview-pane headers. Priority:
 *
 *   1. The most recent `type=system, subtype=away_summary` row IF it comes
 *      after the last user message (i.e. the recap is fresh).
 *   2. Else: the first 5 lines of the most recent `type=assistant` message,
 *      after whitespace normalization.
 *   3. Else: empty string.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D6.
 */
export function getRecapText(
  db: DatabaseSync,
  conversationId: string,
  source: string,
): string {
  const lastUserTs = db.prepare(
    "SELECT COALESCE(MAX(timestamp), 0) AS ts FROM messages " +
      "WHERE conversation_id = ? AND source = ? AND type = 'user'"
  ).get(conversationId, source) as { ts: number } | undefined;
  const summary = db.prepare(
    "SELECT content FROM messages WHERE conversation_id = ? AND source = ? " +
      "AND type = 'system' AND subtype = 'away_summary' AND timestamp > ? " +
      "ORDER BY timestamp DESC LIMIT 1"
  ).get(conversationId, source, lastUserTs?.ts ?? 0) as { content: string } | undefined;
  if (summary?.content) return summary.content;

  const assistant = db.prepare(
    "SELECT content FROM messages WHERE conversation_id = ? AND source = ? " +
      "AND type = 'assistant' ORDER BY timestamp DESC LIMIT 1"
  ).get(conversationId, source) as { content: string } | undefined;
  if (!assistant?.content) return "";
  return headLines(assistant.content, RECAP_MAX_LINES);
}

/** Strip ANSI, take first `n` non-empty lines, trimmed. */
function headLines(text: string, n: number): string {
  // eslint-disable-next-line no-control-regex
  const ansi = new RegExp(String.fromCharCode(0x1b) + "\\[[0-?]*[ -/]*[@-~]", "g");
  const cleaned = text.replace(ansi, "");
  const out: string[] = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    out.push(line);
    if (out.length >= n) break;
  }
  return out.join("\n");
}
