import { useEffect, useRef, useState } from "react";
import type { DatabaseSync } from "node:sqlite";
import type { ResultRow } from "../../core/types.js";
import { renderPreview } from "../../core/render/preview.js";

interface Opts {
  db: DatabaseSync;
  row: ResultRow | undefined;
  useColor: boolean;
  width: number;
}

export function usePreview({ db, row, useColor, width }: Opts): string {
  const cache = useRef<Map<string, string>>(new Map());
  const [text, setText] = useState("");

  useEffect(() => {
    cache.current.clear();
  }, [width]);

  useEffect(() => {
    if (!row) {
      setText("");
      return;
    }
    const key = `${row.source}:${row.sessionId}`;
    const cached = cache.current.get(key);
    if (cached !== undefined) {
      setText(cached);
      return;
    }
    try {
      // renderPreview(db, sessionId, source, useColor)
      const out = renderPreview(db, row.sessionId, row.source, useColor);
      cache.current.set(key, out);
      setText(out);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setText(`(preview unavailable: ${msg})`);
    }
  }, [row, useColor]); // eslint-disable-line react-hooks/exhaustive-deps

  return text;
}
