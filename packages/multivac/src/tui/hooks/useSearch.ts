import { useEffect, useRef } from "react";
import type { DatabaseSync } from "node:sqlite";
import { buildProjectGroups } from "../../core/search/unified.js";
import type { Args, Selectable, SessionStore } from "../../core/types.js";

interface Opts {
  db: DatabaseSync;
  args: Args;
  query: string;
  sessionStore: SessionStore;
  onResults: (rows: Selectable[], error?: string) => void;
  onPending: (pending: boolean) => void;
}

export function useSearch({ db, args, query, sessionStore, onResults, onPending }: Opts): void {
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    onPending(true);
    timer.current = setTimeout(() => {
      onPending(false);
      try {
        const rows = buildProjectGroups(db, { ...args, query }, sessionStore);
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
