import type { ResultRow, Selectable, ProjectHeader, MoreRow } from "../types.js";
import { fmtDate } from "../format.js";
import { resumeOneLiner, shellQuote } from "./resume-line.js";

export interface RenderMarkdownInput {
  /**
   * Flat row list produced by `buildProjectGroups`. Each ProjectHeader is
   * followed by its ChatRows and an optional MoreRow. Markdown rendering
   * iterates with the same grouping discipline so the on-screen and printed
   * views stay isomorphic.
   */
  rows: Selectable[];
  query: string;
}

/**
 * Render a project-grouped Selectable list as markdown with one heading per
 * project and embedded resume one-liners.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D13.
 */
export function renderMarkdown(input: RenderMarkdownInput): string {
  const { rows, query } = input;
  if (rows.length === 0) {
    return "no matches\n";
  }

  const out: string[] = [];
  const suffix = query.length > 0 ? ` matching "${query}"` : "";
  const recentTag = query.length > 0 ? "" : ", recent activity";

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind !== "project") {
      // Defensive: a chat or more row without a preceding project header — emit
      // a synthetic header from the chat's projectPath if it's a ChatRow, else
      // skip.
      if (row.kind === "chat") {
        const synthetic: ProjectHeader = {
          kind: "project",
          projectPath: row.projectPath,
          projectName: row.projectName,
          chatCount: 1,
          lastActivity: row.lastActivity,
          topChatTitles: [],
        };
        const { rendered, advancedBy } = renderProjectSection(synthetic, rows, i, suffix, recentTag);
        out.push(...rendered);
        i += advancedBy;
        continue;
      }
      i++;
      continue;
    }
    const { rendered, advancedBy } = renderProjectSection(row, rows, i, suffix, recentTag);
    out.push(...rendered);
    i += advancedBy;
  }
  return out.join("\n");
}

function renderProjectSection(
  proj: ProjectHeader,
  rows: Selectable[],
  startIdx: number,
  suffix: string,
  recentTag: string,
): { rendered: string[]; advancedBy: number } {
  const out: string[] = [];
  const date = fmtDate(proj.lastActivity);
  const count = `${proj.chatCount} chat${proj.chatCount === 1 ? "" : "s"}`;
  const matchHint = suffix.length > 0 ? `${count}${suffix}` : count;
  out.push(`## ${proj.projectPath} — ${matchHint}, last activity ${date}${recentTag === "" ? "" : ""}`);
  out.push("");
  out.push(`New chat here: \`(cd ${shellQuote(proj.projectPath)} && claude)\``);
  out.push("");

  // Consume contiguous chat/more rows until the next project header.
  let i = startIdx + 1;
  let chatNumber = 0;
  while (i < rows.length && rows[i].kind !== "project") {
    const child = rows[i];
    if (child.kind === "chat") {
      chatNumber++;
      out.push(...renderChatEntry(child, chatNumber));
    } else if (child.kind === "more") {
      out.push(`(${(child as MoreRow).remainingCount} more)`);
      out.push("");
    }
    i++;
  }
  return { rendered: out, advancedBy: i - startIdx };
}

function renderChatEntry(c: ResultRow, ordinal: number): string[] {
  const out: string[] = [];
  const date = fmtDate(c.lastActivity);
  const branch = c.gitBranch ? ` (${c.gitBranch})` : "";
  const title = c.title ?? c.sessionId.slice(0, 8);
  out.push(`${ordinal}. **${title}** — ${date} · ${c.msgCount} msgs${branch}`);
  if (c.recapText) {
    const oneLine = c.recapText.replace(/\n+/g, " ").trim();
    out.push(`   - recap: ${oneLine}`);
  } else if (c.snippet) {
    const oneLine = c.snippet.replace(/<<<|>>>/g, "").replace(/\s+/g, " ").trim();
    if (oneLine.length > 0) out.push(`   - snippet: ${oneLine}`);
  }
  out.push(`   - Resume: \`${resumeOneLiner(c)}\``);
  out.push("");
  return out;
}
