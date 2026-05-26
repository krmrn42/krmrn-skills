import { useEffect, useRef, useState } from "react";
import type { DatabaseSync } from "node:sqlite";
import type { Selectable } from "../../core/types.js";
import { renderPreview } from "../../core/render/preview.js";
import { renderProjectPreview } from "../../core/render/project-preview.js";

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
    // No preview for MoreRow (cursor never lands on it; defensive check).
    if (!row || row.kind === "more") {
      setText("");
      return;
    }
    const key = row.kind === "chat"
      ? `chat:${row.source}:${row.sessionId}`
      : `project:${row.projectPath}`;
    const cached = cache.current.get(key);
    if (cached !== undefined) {
      setText(cached);
      return;
    }
    try {
      const out = row.kind === "chat"
        ? renderPreview(db, row.sessionId, row.source, useColor)
        : renderProjectPreview(db, row, useColor);
      cache.current.set(key, out);
      setText(out);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setText(`(preview unavailable: ${msg})`);
    }
  }, [row, useColor]); // eslint-disable-line react-hooks/exhaustive-deps

  return text;
}
