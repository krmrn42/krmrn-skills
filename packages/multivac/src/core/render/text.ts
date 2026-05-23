import type { ResultRow } from "../types.js";
import {
  projectDisplay,
  fmtDate,
  shortSession,
  colorizeSnippet,
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_RESET,
} from "../format.js";
import { resumeOneLiner } from "./resume-line.js";

export function renderText(results: ResultRow[], useColor: boolean): string {
  if (!results.length) {
    return "no matches\n";
  }
  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const proj = projectDisplay(r.projectPath, r.projectName);
    const date = fmtDate(r.lastActivity);
    const snippet = colorizeSnippet(r.snippet, useColor);
    const idx = String(i + 1).padStart(3);
    const sid = shortSession(r.sessionId);
    const msgs = String(r.msgCount).padStart(4);
    let header: string;
    if (useColor) {
      header = `${idx}. ${ANSI_BOLD}${proj}${ANSI_RESET}  ${ANSI_DIM}${date}  ${msgs} msgs  ${sid}${ANSI_RESET}`;
    } else {
      header = `${idx}. ${proj}  ${date}  ${msgs} msgs  ${sid}`;
    }
    lines.push(header);
    if (snippet) lines.push(`     ${snippet}`);
    lines.push(`     ${resumeOneLiner(r)}`);
  }
  return lines.join("\n") + "\n";
}
