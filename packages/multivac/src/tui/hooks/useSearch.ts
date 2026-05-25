import { useEffect, useRef } from "react";
import type { DatabaseSync } from "node:sqlite";
import { ftsSearch } from "../../core/search/fts.js";
import { recentConversations } from "../../core/search/recent.js";
import type { Args, ResultRow, SessionStore } from "../../core/types.js";

interface Opts {
  db: DatabaseSync;
  args: Args;
  query: string;
  sessionStore: SessionStore;
  onResults: (rows: ResultRow[], error?: string) => void;
  onPending: (pending: boolean) => void;
}

export function useSearch({ db, args, query, sessionStore, onResults, onPending }: Opts): void {
  const recentCache = useRef<ResultRow[] | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    onPending(true);
    timer.current = setTimeout(() => {
      onPending(false);
      try {
        if (!query.trim()) {
          if (recentCache.current === null) {
            recentCache.current = recentConversations(db, {
              limit: args.limit,
              projectFilter: args.project,
              sessionStore,
            });
          }
          onResults(recentCache.current);
          return;
        }
        const rows = ftsSearch(db, { ...args, query, sessionStore });
        onResults(rows);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        onResults([], msg);
      }
    }, 80);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
}
