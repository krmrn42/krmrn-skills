import type { DatabaseSync } from "node:sqlite";
import type { ProjectHeader } from "../types.js";
import { fmtDate, ANSI_BOLD, ANSI_DIM, ANSI_RESET } from "../format.js";
import { pickBox } from "../../tui/lib/box.js";
import { synthesizeTitle } from "../search/recent.js";
import { getRecapText } from "../search/recap.js";

const W = 70;
const RECENT_LIMIT = 5;

interface RecentChatRow {
  conversation_id: string;
  last_ts: number | null;
  msg_count: number;
}

/**
 * Render a project-header preview: header box (path · chat count · branches
 * touched), up to 5 most-recent chats with their recap snippets, then the
 * "new chat" hint.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D7.
 */
export function renderProjectPreview(
  db: DatabaseSync,
  proj: ProjectHeader,
  useColor: boolean,
): string {
  const bold = useColor ? ANSI_BOLD : "";
  const dim = useColor ? ANSI_DIM : "";
  const reset = useColor ? ANSI_RESET : "";
  const box = pickBox(!useColor);
  const horiz = box.horizontal.repeat(W - 2);

  const branchRow = db
    .prepare(
      "SELECT DISTINCT git_branch FROM messages " +
        "WHERE project_path = ? AND git_branch IS NOT NULL " +
        "ORDER BY git_branch"
    )
    .all(proj.projectPath) as unknown as Array<{ git_branch: string | null }>;
  const branches = branchRow.map((r) => r.git_branch).filter(Boolean) as string[];

  const lines: string[] = [];
  lines.push(`${dim}${box.topLeft}${horiz}${box.topRight}${reset}\n`);
  lines.push(`${dim}${box.vertical} ${reset}${bold}${proj.projectPath}${reset}\n`);
  lines.push(
    `${dim}${box.vertical} ${reset}${dim}` +
      `${proj.chatCount} chat${proj.chatCount === 1 ? "" : "s"} · ` +
      `last ${fmtDate(proj.lastActivity)}${reset}\n`,
  );
  if (branches.length > 0) {
    lines.push(`${dim}${box.vertical} ${reset}${dim}branches: ${branches.join(", ")}${reset}\n`);
  }
  lines.push(`${dim}${box.bottomLeft}${horiz}${box.bottomRight}${reset}\n\n`);

  const recent = db
    .prepare(
      "SELECT conversation_id, MAX(timestamp) AS last_ts, " +
        "       COUNT(*) AS msg_count " +
        "FROM messages WHERE project_path = ? AND type IN ('user', 'assistant') " +
        "GROUP BY conversation_id ORDER BY last_ts DESC LIMIT ?"
    )
    .all(proj.projectPath, RECENT_LIMIT) as unknown as RecentChatRow[];

  if (recent.length > 0) {
    lines.push(`${dim}Recent chats here:${reset}\n`);
    const titleStmt = db.prepare(
      "SELECT content FROM messages WHERE conversation_id = ? AND type = 'user' " +
        "ORDER BY timestamp ASC LIMIT 5"
    );
    for (const c of recent) {
      // Title: first non-wrapper user message; falls back to short session id.
      const cands = titleStmt.all(c.conversation_id) as Array<{ content: string | null }>;
      let title = c.conversation_id.slice(0, 8);
      for (const cand of cands) {
        if (!cand.content) continue;
        const synth = synthesizeTitle(cand.content);
        if (synth) { title = synth; break; }
      }
      lines.push(
        `  ${bold}${title}${reset} ` +
          `${dim}${fmtDate(c.last_ts)}  ${c.msg_count} msgs${reset}\n`,
      );
      // Per-chat recap snippet (spec §D7: "with their recap snippets").
      const recap = getRecapText(db, c.conversation_id, "claude");
      if (recap) {
        const firstLine = recap.split("\n", 1)[0].trim();
        if (firstLine.length > 0) {
          lines.push(`     ${dim}recap: ${firstLine}${reset}\n`);
        }
      }
    }
    lines.push("\n");
  }

  lines.push(`${dim}(Enter: new chat here)${reset}\n`);
  return lines.join("");
}
