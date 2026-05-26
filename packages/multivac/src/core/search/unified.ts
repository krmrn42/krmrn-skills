import type { DatabaseSync } from "node:sqlite";
import type { Args, Selectable, SessionStore, SectionHeader } from "../types.js";
import { recentConversations } from "./recent.js";
import { ftsSearch } from "./fts.js";
import { searchDirectories } from "./dirs.js";

const DIR_LIMIT = 5;
const FILTERED_DIR_LIMIT = 10;

/**
 * Combine directory and chat results into a single ordered Selectable list,
 * with section headers inserted between non-empty sections. When the query
 * is empty, both sections show their "recent" view. When non-empty, dirs use
 * substring matching and chats use FTS5 BM25.
 *
 * Section dividers are emitted only when more than one section has rows
 * (spec §D9).
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D9.
 */
export function buildUnifiedResults(
  db: DatabaseSync,
  args: Args,
  sessionStore: SessionStore | null,
): Selectable[] {
  const query = args.query.trim();
  const dirFilter = query.length > 0 ? query : null;
  const dirLimit = query.length > 0 ? FILTERED_DIR_LIMIT : DIR_LIMIT;

  const dirs = searchDirectories(db, { limit: dirLimit, projectFilter: dirFilter });

  let chats;
  if (query.length === 0) {
    chats = recentConversations(db, {
      limit: args.limit,
      projectFilter: args.project,
      sessionStore,
    });
  } else {
    chats = ftsSearch(db, { ...args, sessionStore });
  }

  const sectionsWithRows: Array<Selectable[]> = [];
  if (dirs.length > 0) sectionsWithRows.push(dirs);
  if (chats.length > 0) sectionsWithRows.push(chats);
  const showHeaders = sectionsWithRows.length > 1;

  const out: Selectable[] = [];
  if (dirs.length > 0) {
    if (showHeaders) {
      const label = query.length > 0
        ? `working dirs (${dirs.length})`
        : `working dirs (recent ${dirs.length})`;
      out.push({ kind: "section", label } satisfies SectionHeader);
    }
    out.push(...dirs);
  }
  if (chats.length > 0) {
    if (showHeaders) {
      const label = query.length > 0
        ? `chats (${chats.length}, by relevance)`
        : `chats (recent ${chats.length})`;
      out.push({ kind: "section", label } satisfies SectionHeader);
    }
    out.push(...chats);
  }
  return out;
}
