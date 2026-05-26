import React from "react";
import { Box, Text } from "ink";
import type { Selectable, ResultRow, DirRow, SectionHeader } from "../../core/types.js";
import { projectDisplay, shortSession, fmtDate, colorizeSnippet } from "../../core/format.js";
import { truncateToWidth } from "../lib/width.js";

interface Props {
  results: Selectable[];
  cursor: number;
  noColor: boolean;
  listWidth: number;
  maxRows: number;
  dimRows: boolean;
}

const CHAT_ROW_HEIGHT = 3;
const DIR_ROW_HEIGHT = 2;
const SECTION_ROW_HEIGHT = 1;

function rowHeight(row: Selectable): number {
  if (row.kind === "section") return SECTION_ROW_HEIGHT;
  if (row.kind === "dir") return DIR_ROW_HEIGHT;
  return CHAT_ROW_HEIGHT;
}

export function ResultList({ results, cursor, noColor, listWidth, maxRows, dimRows }: Props) {
  if (!results.length) {
    return <Box><Text dimColor>(no results)</Text></Box>;
  }

  // Pin partition (chats only). The first run of pinned chats and the first
  // non-pinned chat get a "── recent ──" divider between them.
  let firstUnpinnedChatIdx = -1;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.kind === "chat" && !r.isPinned) {
      firstUnpinnedChatIdx = i;
      break;
    }
  }
  const hasPinDivider = (() => {
    if (firstUnpinnedChatIdx <= 0) return false;
    // At least one preceding row must be a pinned chat.
    for (let i = 0; i < firstUnpinnedChatIdx; i++) {
      const r = results[i];
      if (r.kind === "chat" && r.isPinned) return true;
    }
    return false;
  })();

  // Variable-height scroll. Pick a window starting at `scrollOffset` such that
  // the cursor row fits and rows after it fit greedily.
  let scrollOffset = Math.max(0, Math.min(cursor, results.length - 1));
  // Walk back while there's room for the cursor row and the preceding rows.
  let used = rowHeight(results[scrollOffset]);
  while (scrollOffset > 0) {
    const prevHeight = rowHeight(results[scrollOffset - 1]);
    if (used + prevHeight + (hasPinDivider ? 1 : 0) > maxRows) break;
    scrollOffset--;
    used += prevHeight;
  }

  const pinMarker = noColor ? "* " : "📌 ";
  const dirMarker = noColor ? "[dir] " : "📁 ";
  const chatMarker = noColor ? "[chat] " : "💬 ";
  const cursorPrefix = "▌ ";
  const blankPrefix = "  ";
  const dividerText = "── recent ──";

  const nodes: React.ReactElement[] = [];
  let pinDividerWritten = false;
  let consumed = 0;

  for (let i = scrollOffset; i < results.length; i++) {
    const row = results[i];
    const isCur = i === cursor;
    const h = rowHeight(row);
    if (consumed + h > maxRows) break;

    if (
      hasPinDivider &&
      !pinDividerWritten &&
      i === firstUnpinnedChatIdx &&
      scrollOffset < firstUnpinnedChatIdx &&
      consumed + 1 <= maxRows
    ) {
      nodes.push(<Text key={`pin-div-${i}`} dimColor>{dividerText}</Text>);
      pinDividerWritten = true;
      consumed += 1;
    }

    if (row.kind === "section") {
      nodes.push(renderSectionHeader(row, i, listWidth));
      consumed += SECTION_ROW_HEIGHT;
      continue;
    }
    if (row.kind === "dir") {
      nodes.push(...renderDirRow(row, i, isCur, listWidth, dimRows, dirMarker, cursorPrefix, blankPrefix));
      consumed += DIR_ROW_HEIGHT;
      continue;
    }
    nodes.push(...renderChatRow(row, i, isCur, noColor, listWidth, dimRows,
      pinMarker, chatMarker, cursorPrefix, blankPrefix));
    consumed += CHAT_ROW_HEIGHT;
  }

  return <Box flexDirection="column">{nodes}</Box>;
}

function renderSectionHeader(row: SectionHeader, key: number,
                              listWidth: number): React.ReactElement {
  const text = truncateToWidth(`── ${row.label} ──`, listWidth);
  return <Text key={`sec-${key}`} dimColor>{text}</Text>;
}

function renderDirRow(
  row: DirRow,
  key: number,
  isCur: boolean,
  listWidth: number,
  dim: boolean,
  marker: string,
  cursorPrefix: string,
  blankPrefix: string,
): React.ReactElement[] {
  const date = fmtDate(row.lastActivity);
  const count = `${row.chatCount} chat${row.chatCount === 1 ? "" : "s"}`;
  const head = `${marker}${row.projectPath}  ${count}  ${date}`;
  const headTrunc = truncateToWidth(head, listWidth - 2);
  const second = row.topChatTitles.length > 0
    ? truncateToWidth(row.topChatTitles.join(" · "), listWidth - 4)
    : "";
  const out: React.ReactElement[] = [];
  out.push(
    <Text key={`d-h-${key}`} bold={isCur && !dim} dimColor={dim}>
      {isCur ? cursorPrefix : blankPrefix}{headTrunc}
    </Text>,
  );
  out.push(
    <Text key={`d-s-${key}`} dimColor>{"    "}{second}</Text>,
  );
  return out;
}

function renderChatRow(
  row: ResultRow,
  key: number,
  isCur: boolean,
  noColor: boolean,
  listWidth: number,
  dim: boolean,
  pinMarker: string,
  chatMarker: string,
  cursorPrefix: string,
  blankPrefix: string,
): React.ReactElement[] {
  const proj = projectDisplay(row.projectPath, row.projectName);
  const date = fmtDate(row.lastActivity);
  const sid = shortSession(row.sessionId);
  const msgs = String(row.msgCount).padStart(4);
  const headBody = row.title
    ? `${row.title} · ${proj}  ${date}  ${msgs} msgs  ${sid}`
    : `${proj}  ${date}  ${msgs} msgs  ${sid}`;
  const pinPart = row.isPinned ? pinMarker : chatMarker;
  const head = pinPart + headBody;
  const headTrunc = truncateToWidth(head, listWidth - 2);

  const snippetText = colorizeSnippet(row.snippet || "", !noColor);
  const snipTrunc = snippetText ? truncateToWidth(snippetText, listWidth - 4) : "";

  const metaParts: string[] = [];
  if (row.gitBranch) metaParts.push("(" + row.gitBranch + ")");
  if (row.skill) metaParts.push(row.skill);
  const metaText = metaParts.length > 0
    ? truncateToWidth(metaParts.join(" · "), listWidth - 4)
    : "";

  const previewLine = snipTrunc ||
    (row.recapText ? truncateToWidth("recap: " + row.recapText.replace(/\n/g, " ⏎ "), listWidth - 4) : "");

  const out: React.ReactElement[] = [];
  out.push(
    <Text key={`c-h-${key}`} bold={isCur && !dim} dimColor={dim}>
      {isCur ? cursorPrefix : blankPrefix}{headTrunc}
    </Text>,
  );
  if (metaText) {
    out.push(<Text key={`c-m-${key}`} dimColor>{"    "}{metaText}</Text>);
  } else {
    out.push(<Text key={`c-m-${key}`}>{""}</Text>);
  }
  if (previewLine) {
    out.push(<Text key={`c-s-${key}`} dimColor>{"    "}{previewLine}</Text>);
  } else {
    out.push(<Text key={`c-s-${key}`}>{""}</Text>);
  }
  return out;
}
