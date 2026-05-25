import type { ResultRow } from "../types.js";
import { projectDisplay, fmtDate } from "../format.js";

// 7 columns: session_id, project, project_path, date, messages_count, snippet, score
// (source column deferred to P2)
export function renderTsv(results: ResultRow[]): string {
  const out: string[] = [];
  for (const r of results) {
    const proj = projectDisplay(r.projectPath, r.projectName);
    const date = fmtDate(r.lastActivity);
    const snippet = r.snippet.split(/\s+/).filter(Boolean).join(" ");
    const score = (typeof r.score === "number" ? r.score : 0).toFixed(4);
    out.push(
      [r.sessionId, proj, r.projectPath, date, r.msgCount, snippet, score].join("\t")
    );
  }
  return out.length ? out.join("\n") + "\n" : "";
}
