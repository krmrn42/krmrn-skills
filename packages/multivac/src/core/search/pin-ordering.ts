import type { ResultRow, SessionStore } from "../types.js";

// Pins are now keyed by `${source}:${sessionId}`. Construct that key for the
// row being considered against the pin list.
function pinKey(row: ResultRow): string {
  return `${row.source}:${row.sessionId}`;
}

export function applyPinOrdering(
  rows: ResultRow[],
  sessionStore: SessionStore | null | undefined,
  limit: number,
): ResultRow[] {
  const pins = sessionStore?.pins && Array.isArray(sessionStore.pins) ? sessionStore.pins : [];
  if (!pins.length) {
    return rows.slice(0, Math.max(0, limit | 0)).map((r) => ({ ...r, isPinned: false }));
  }
  const pinIndex = new Map<string, number>();
  for (let i = 0; i < pins.length; i++) pinIndex.set(pins[i], i);
  const pinned: ResultRow[] = [];
  const unpinned: ResultRow[] = [];
  for (const r of rows) {
    if (pinIndex.has(pinKey(r))) pinned.push({ ...r, isPinned: true });
    else unpinned.push({ ...r, isPinned: false });
  }
  pinned.sort((a, b) => (pinIndex.get(pinKey(a)) ?? 0) - (pinIndex.get(pinKey(b)) ?? 0));
  return pinned.concat(unpinned).slice(0, Math.max(0, limit | 0));
}
