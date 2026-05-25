// ANSI-aware string width utilities.
// Ported from picker.js:40-108.

/**
 * Count visible characters in a string, ignoring ANSI escape sequences.
 */
export function visibleLen(s: string): number {
  let n = 0;
  let inEsc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inEsc) {
      // CSI sequences end with a letter in the @-~ range (64-126)
      if (c >= 64 && c <= 126) inEsc = false;
      continue;
    }
    if (c === 0x1b) {
      inEsc = true;
      continue;
    }
    n++;
  }
  return n;
}

/**
 * Truncate a string to at most `width` visible characters, appending `ellipsis`
 * (default "…") if the string was longer. ANSI escape sequences are preserved
 * and do not count toward the width.
 */
export function truncateToWidth(s: string, width: number, ellipsis = "…"): string {
  if (visibleLen(s) <= width) return s;
  const ESC = "\x1b";
  let out = "";
  let n = 0;
  let inEsc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inEsc) {
      out += c;
      if (c.charCodeAt(0) >= 64 && c.charCodeAt(0) <= 126) inEsc = false;
      continue;
    }
    if (c === ESC) {
      out += c;
      inEsc = true;
      continue;
    }
    if (n + 1 > width - 1) {
      out += ellipsis;
      break;
    }
    out += c;
    n++;
  }
  return out;
}

/**
 * Word-wrap a string to `width` visible characters per line.
 * Respects existing newlines. Returns an array of lines.
 * ANSI-naive (preview content is expected to be plain text).
 */
export function wrapToWidth(s: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of s.split("\n")) {
    if (para === "") {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const word of para.split(/(\s+)/)) {
      if (visibleLen(cur) + visibleLen(word) > width) {
        if (cur) lines.push(cur);
        cur = word.replace(/^\s+/, "");
      } else {
        cur += word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}
