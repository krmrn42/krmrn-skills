export const SNIPPET_OPEN = "<<<";
export const SNIPPET_CLOSE = ">>>";

export const ANSI_BOLD = "\x1b[1m";
export const ANSI_DIM = "\x1b[2m";
export const ANSI_RESET = "\x1b[0m";

export function projectDisplay(projectPath: string, projectName: string): string {
  if (!projectPath) return projectName || "?";
  const parts = projectPath.split("/").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return projectName || projectPath;
}

export function shortSession(sid: string | null | undefined): string {
  return sid ? sid.slice(0, 8) : "????????";
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "????-??-??";
  let n = ts;
  if (n > 10_000_000_000) n = Math.floor(n / 1000);
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "????-??-??";
  return d.toISOString().slice(0, 10);
}

export function colorizeSnippet(snippet: string, useColor: boolean): string {
  if (!snippet) return "";
  let s = snippet;
  if (useColor) {
    s = s.split(SNIPPET_OPEN).join(ANSI_BOLD).split(SNIPPET_CLOSE).join(ANSI_RESET);
  }
  return s.split(/\s+/).filter(Boolean).join(" ");
}
