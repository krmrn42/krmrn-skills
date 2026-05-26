import type { ResultRow, DirRow } from "../types.js";
import { fmtDate } from "../format.js";
import { resumeOneLiner, shellQuote } from "./resume-line.js";

export interface RenderMarkdownInput {
  dirs: DirRow[];
  chats: ResultRow[];
  query: string;
}

/**
 * Render dirs + chats as sectioned markdown with embedded resume one-liners.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D13.
 */
export function renderMarkdown(input: RenderMarkdownInput): string {
  const { dirs, chats, query } = input;
  if (dirs.length === 0 && chats.length === 0) {
    return "no matches\n";
  }
  const out: string[] = [];
  const labelSuffix = query.length > 0 ? ` matching "${query}"` : " (recent)";

  if (dirs.length > 0) {
    out.push(`## Working directories${labelSuffix}`);
    out.push("");
    dirs.forEach((d, i) => {
      const date = fmtDate(d.lastActivity);
      const count = `${d.chatCount} chat${d.chatCount === 1 ? "" : "s"}`;
      out.push(`${i + 1}. **${d.projectPath}** — ${count}, last activity ${date}`);
      if (d.topChatTitles.length > 0) {
        out.push(`   - Recent: ${d.topChatTitles.join(", ")}`);
      }
      out.push(`   - New chat: \`(cd ${shellQuote(d.projectPath)} && claude)\``);
      out.push("");
    });
  }

  if (chats.length > 0) {
    out.push(`## Chats${labelSuffix}`);
    out.push("");
    chats.forEach((c, i) => {
      const date = fmtDate(c.lastActivity);
      const branch = c.gitBranch ? ` (${c.gitBranch})` : "";
      const title = c.title ?? c.sessionId.slice(0, 8);
      out.push(`${i + 1}. **${title}** — \`${c.projectPath}\` · ${date} · ${c.msgCount} msgs${branch}`);
      if (c.recapText) {
        const oneLine = c.recapText.replace(/\n+/g, " ").trim();
        out.push(`   - recap: ${oneLine}`);
      } else if (c.snippet) {
        const oneLine = c.snippet.replace(/<<<|>>>/g, "").replace(/\s+/g, " ").trim();
        if (oneLine.length > 0) out.push(`   - snippet: ${oneLine}`);
      }
      out.push(`   - Resume: \`${resumeOneLiner(c)}\``);
      out.push("");
    });
  }

  return out.join("\n");
}
