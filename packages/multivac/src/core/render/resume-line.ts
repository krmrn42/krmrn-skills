import type { ResultRow } from "../types.js";

export function shellQuote(s: string): string {
  if (s === "" || /[^A-Za-z0-9_./@:+\-=,%]/.test(s)) {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  return s;
}

// In P1 only Claude has a resume capability; this helper returns the same
// one-liner the v0.6.0 renderText produced. When more sources land we'll
// dispatch via getSource(row.source).resume?.resumeOneLiner.
export function resumeOneLiner(row: ResultRow): string {
  if (!row.projectPath) {
    return `claude --resume ${row.sessionId}  # original project path unknown`;
  }
  return `(cd ${shellQuote(row.projectPath)} && claude --resume ${row.sessionId})`;
}
