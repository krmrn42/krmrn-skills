import React from "react";
import { Box, Text } from "ink";
import type { ResultRow } from "../../core/types.js";
import { projectDisplay, shortSession, fmtDate, colorizeSnippet } from "../../core/format.js";
import { truncateToWidth } from "../lib/width.js";

interface Props {
  results: ResultRow[];
  cursor: number;
  noColor: boolean;
  listWidth: number;
  maxRows: number;
  dimRows: boolean; // true when rename modal is active
}

export function ResultList({ results, cursor, noColor, listWidth, maxRows, dimRows }: Props) {
  if (!results.length) {
    return <Box><Text dimColor>(no results)</Text></Box>;
  }

  // Pin partition: find the index of the first non-pinned row.
  let firstUnpinnedIdx = -1;
  for (let i = 0; i < results.length; i++) {
    if (!results[i].isPinned) {
      firstUnpinnedIdx = i;
      break;
    }
  }
  const hasDivider =
    results.length > 0 && firstUnpinnedIdx > 0 && firstUnpinnedIdx < results.length;
  const dividerText = "── recent ──";

  // Two lines per result. Reserve one row for divider when it exists (conservative,
  // matches picker.js:625 which reserves even when scrolled past the divider).
  const rowsPerResult = 2;
  const usableHeight = hasDivider ? maxRows - 1 : maxRows;
  const maxVisible = Math.max(1, Math.floor(usableHeight / rowsPerResult));

  // Scroll offset: keep cursor in window. Matches picker.js:627-628.
  let scrollOffset = 0;
  if (cursor < scrollOffset) scrollOffset = cursor;
  if (cursor >= scrollOffset + maxVisible) scrollOffset = cursor - maxVisible + 1;
  // Clamp scrollOffset to valid range (for initial render).
  scrollOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, results.length - maxVisible)));

  const visible = results.slice(scrollOffset, scrollOffset + maxVisible);

  const pinMarker = noColor ? "* " : "📌 ";
  const cursorPrefix = "▌ ";
  const blankPrefix = "  ";

  const nodes: React.ReactElement[] = [];
  let dividerWritten = false;

  for (let i = 0; i < visible.length; i++) {
    const idx = scrollOffset + i;
    const r = visible[i];
    const isCur = idx === cursor;
    const isPinned = !!r.isPinned;

    // Insert the divider between the last pinned row and the first unpinned row
    // IF both partitions are in the visible window. Matches picker.js:660-671.
    if (
      hasDivider &&
      !dividerWritten &&
      idx === firstUnpinnedIdx &&
      scrollOffset < firstUnpinnedIdx
    ) {
      nodes.push(
        <Text key={`div-${i}`} dimColor>
          {dividerText}
        </Text>,
      );
      dividerWritten = true;
    }

    const proj = projectDisplay(r.projectPath, r.projectName);
    const date = fmtDate(r.lastActivity);
    const sid = shortSession(r.sessionId);
    const msgs = String(r.msgCount).padStart(4);
    // Header body: title · proj  date  msgs msgs  sid (with title) or proj  date  msgs msgs  sid.
    const headBody = r.title
      ? `${r.title} · ${proj}  ${date}  ${msgs} msgs  ${sid}`
      : `${proj}  ${date}  ${msgs} msgs  ${sid}`;
    const pinPart = isPinned ? pinMarker : "";
    const head = pinPart + headBody;
    const headTrunc = truncateToWidth(head, listWidth - 2);

    const snippet = colorizeSnippet(r.snippet || "", !noColor);
    const snipTrunc = snippet ? truncateToWidth(snippet, listWidth - 4) : "";

    const dim = dimRows;

    nodes.push(
      <Text key={`h-${i}`} bold={isCur && !dimRows} dimColor={dim}>
        {isCur ? cursorPrefix : blankPrefix}
        {headTrunc}
      </Text>,
    );

    if (snipTrunc) {
      nodes.push(
        <Text key={`s-${i}`} dimColor>
          {"    "}
          {snipTrunc}
        </Text>,
      );
    } else {
      // Always emit two lines per row to keep layout stable.
      nodes.push(<Text key={`s-${i}`}>{""}</Text>);
    }
  }

  return <Box flexDirection="column">{nodes}</Box>;
}
