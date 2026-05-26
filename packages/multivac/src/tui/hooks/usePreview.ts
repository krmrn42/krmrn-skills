import { useEffect, useRef, useState } from "react";
import type { DatabaseSync } from "node:sqlite";
import type { Selectable } from "../../core/types.js";
import { renderPreview } from "../../core/render/preview.js";
import { renderDirPreview } from "../../core/render/dir-preview.js";

interface Opts {
  db: DatabaseSync;
  row: Selectable | undefined;
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
    if (!row || row.kind === "section") {
      setText("");
      return;
    }
    const key = row.kind === "chat"
      ? `chat:${row.source}:${row.sessionId}`
      : `dir:${row.projectPath}`;
    const cached = cache.current.get(key);
    if (cached !== undefined) {
      setText(cached);
      return;
    }
    try {
      const out = row.kind === "chat"
        ? renderPreview(db, row.sessionId, row.source, useColor)
        : renderDirPreview(db, row, useColor);
      cache.current.set(key, out);
      setText(out);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setText(`(preview unavailable: ${msg})`);
    }
  }, [row, useColor]); // eslint-disable-line react-hooks/exhaustive-deps

  return text;
}
