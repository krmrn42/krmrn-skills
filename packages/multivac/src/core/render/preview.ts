import type { DatabaseSync } from "node:sqlite";
import {
  projectDisplay,
  fmtDate,
  shortSession,
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_RESET,
} from "../format.js";

export function renderPreview(
  db: DatabaseSync,
  sessionId: string,
  source: string,
  useColor: boolean,
): string {
  const head = db
    .prepare(
      "SELECT project_path, project_name, " +
        "       (SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND source = ?) AS msg_count, " +
        "       (SELECT MAX(timestamp) FROM messages WHERE conversation_id = ? AND source = ?) AS last_ts, " +
        "       (SELECT MIN(timestamp) FROM messages WHERE conversation_id = ? AND source = ?) AS first_ts " +
        "FROM messages WHERE conversation_id = ? AND source = ? LIMIT 1"
    )
    .get(sessionId, source, sessionId, source, sessionId, source, sessionId, source) as
    | {
        project_path: string | null;
        project_name: string | null;
        msg_count: number;
        last_ts: number | null;
        first_ts: number | null;
      }
    | undefined;
  if (!head) {
    return `(no messages found for session ${shortSession(sessionId)})\n`;
  }
  const proj = projectDisplay(head.project_path || "", head.project_name || "");
  const bold = useColor ? ANSI_BOLD : "";
  const dim = useColor ? ANSI_DIM : "";
  const reset = useColor ? ANSI_RESET : "";

  const lines: string[] = [];
  lines.push(
    `${bold}${proj}${reset}  ${dim}(${fmtDate(head.first_ts)} → ${fmtDate(head.last_ts)}, ${head.msg_count} msgs)${reset}\n`
  );
  lines.push(`${dim}session ${sessionId}${reset}\n\n`);

  const rows = db
    .prepare(
      "SELECT type, content, timestamp FROM messages " +
        "WHERE conversation_id = ? AND source = ? AND type IN ('user','assistant') " +
        "ORDER BY timestamp ASC LIMIT 20"
    )
    .all(sessionId, source) as Array<{
      type: string;
      content: string | null;
      timestamp: number | null;
    }>;

  for (const r of rows) {
    const marker = r.type === "user" ? "▶" : "◀";
    lines.push(`${bold}${marker} ${r.type}${reset} ${dim}${fmtDate(r.timestamp)}${reset}\n`);
    let text = (r.content || "").trim();
    if (text.length > 600) text = text.slice(0, 600) + " […]";
    for (const line of text.split("\n")) lines.push(`  ${line}\n`);
    lines.push("\n");
  }
  return lines.join("");
}
