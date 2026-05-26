import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow, Selectable, SessionStore, MoreRow } from "../types.js";
import { recentConversations } from "./recent.js";
import { ftsSearch } from "./fts.js";
import { searchProjects } from "./projects.js";

const HOME_PROJECTS_LIMIT = 30;
const SEARCH_PROJECTS_LIMIT = 100;
const HOME_CHATS_PER_PROJECT = 3;
const MIN_CHATS_ON_NAME_HIT = 3;
const PADDING_LOOKAHEAD = 10;

/**
 * Build a project-grouped Selectable list. Each project's chats are listed
 * inline below its ProjectHeader, with an optional dim MoreRow indicating "Y
 * more" when chats are elided.
 *
 * Per §D9:
 *   - Projects are ordered by most recent activity desc.
 *   - Chats within a project are ordered by their own MAX(timestamp) desc.
 *   - Per-project X (chats shown out of chatCount total):
 *       home (no query)              → min(3, chatCount)
 *       search, name HIT in project  → max(3, chatsMatchingQuery)
 *       search, name DOES NOT hit    → chatsMatchingQuery (may be 0)
 *   - Hide projects with X == 0.
 *
 * Spec: docs/superpowers/specs/2026-05-24-multivac-dashboard-design.md §D9.
 */
export function buildProjectGroups(
  db: DatabaseSync,
  args: Args,
  sessionStore: SessionStore | null,
): Selectable[] {
  const query = args.query.trim();
  const isHome = query.length === 0;

  // Step 1: all candidate projects (ordered by last activity desc).
  // We don't pre-filter by name here — a project may surface because its CHATS
  // match the query even though the name itself does not.
  const projects = searchProjects(db, {
    limit: isHome ? HOME_PROJECTS_LIMIT : SEARCH_PROJECTS_LIMIT,
    projectFilter: null,
  });

  // Step 2: in search mode, fetch FTS matches once and bucket by project_path.
  const matchingChatsByProject = new Map<string, ResultRow[]>();
  if (!isHome) {
    const matches = ftsSearch(db, { ...args, sessionStore });
    for (const c of matches) {
      let arr = matchingChatsByProject.get(c.projectPath);
      if (!arr) {
        arr = [];
        matchingChatsByProject.set(c.projectPath, arr);
      }
      arr.push(c);
    }
  }

  // Step 3: compose the grouped list.
  const out: Selectable[] = [];
  const lowerQuery = query.toLowerCase();

  for (const proj of projects) {
    const chats = chatsForProject({
      db, proj, isHome, query, lowerQuery,
      sessionStore,
      matches: matchingChatsByProject.get(proj.projectPath) ?? [],
    });
    if (chats.length === 0) continue; // hide project

    out.push(proj);
    out.push(...chats);

    const remaining = proj.chatCount - chats.length;
    if (remaining > 0) {
      out.push({
        kind: "more",
        projectPath: proj.projectPath,
        remainingCount: remaining,
      } satisfies MoreRow);
    }
  }

  return out;
}

interface ChatsForProjectArgs {
  db: DatabaseSync;
  proj: { projectPath: string; projectName: string };
  isHome: boolean;
  query: string;
  lowerQuery: string;
  sessionStore: SessionStore | null;
  matches: ResultRow[];
}

function chatsForProject(opts: ChatsForProjectArgs): ResultRow[] {
  const { db, proj, isHome, lowerQuery, sessionStore, matches } = opts;
  if (isHome) {
    return recentConversations(db, {
      limit: HOME_CHATS_PER_PROJECT,
      projectFilter: null,
      exactProjectPath: proj.projectPath,
      sessionStore,
    });
  }
  const nameHit = proj.projectPath.toLowerCase().includes(lowerQuery)
    || proj.projectName.toLowerCase().includes(lowerQuery);
  if (!nameHit) {
    // Show only the matches in this project — could be 0.
    return matches;
  }
  if (matches.length >= MIN_CHATS_ON_NAME_HIT) {
    return matches;
  }
  // Name hit, but matches < 3: pad with most-recent chats not already in matches.
  const matchIds = new Set(matches.map((m) => m.sessionId));
  const recent = recentConversations(db, {
    limit: PADDING_LOOKAHEAD,
    projectFilter: null,
    exactProjectPath: proj.projectPath,
    sessionStore,
  });
  const padding = recent
    .filter((r) => !matchIds.has(r.sessionId))
    .slice(0, MIN_CHATS_ON_NAME_HIT - matches.length);
  return [...matches, ...padding];
}
