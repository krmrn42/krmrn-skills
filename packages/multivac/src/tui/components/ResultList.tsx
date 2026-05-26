import React from "react";
import { Box, Text } from "ink";
import type { Selectable, ResultRow, ProjectHeader, MoreRow } from "../../core/types.js";
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
const PROJECT_ROW_HEIGHT = 2;
const MORE_ROW_HEIGHT = 1;

// Indent applied to chat and "more" rows when they live under a project header
// (which is always the case in v0.8.1). This produces the visual hierarchy in
// the spec mockup: project at column 0, chats indented under it.
const CHILD_INDENT = "  "; // 2 cols

function rowHeight(row: Selectable): number {
  if (row.kind === "project") return PROJECT_ROW_HEIGHT;
  if (row.kind === "more") return MORE_ROW_HEIGHT;
  return CHAT_ROW_HEIGHT;
}

export function ResultList({ results, cursor, noColor, listWidth, maxRows, dimRows }: Props) {
  if (!results.length) {
    return <Box><Text dimColor>(no results)</Text></Box>;
  }

  // Pin partition (chats only). Pinned chats live at the top of their project
  // group. The "── recent ──" divider appears between the last pinned chat and
  // the first unpinned chat in the SAME group.
  // For v0.8.1, the pin partitioning is best implemented at the producer layer
  // (per-group sort); the ResultList just renders. We retain the legacy pin
  // divider behavior at the top of the list for backward compatibility with
  // any code paths that still emit pinned-first across all results.
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
    for (let i = 0; i < firstUnpinnedChatIdx; i++) {
      const r = results[i];
      if (r.kind === "chat" && r.isPinned) return true;
    }
    return false;
  })();

  // Variable-height scroll.
  let scrollOffset = Math.max(0, Math.min(cursor, results.length - 1));
  let used = rowHeight(results[scrollOffset]);
  while (scrollOffset > 0) {
    const prevHeight = rowHeight(results[scrollOffset - 1]);
    if (used + prevHeight + (hasPinDivider ? 1 : 0) > maxRows) break;
    scrollOffset--;
    used += prevHeight;
  }

  const pinMarker = noColor ? "* " : "📌 ";
  const projectMarker = noColor ? "[proj] " : "📁 ";
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

    if (row.kind === "project") {
      nodes.push(...renderProjectHeader(
        row, i, isCur, listWidth, dimRows, projectMarker, cursorPrefix, blankPrefix,
      ));
      consumed += PROJECT_ROW_HEIGHT;
      continue;
    }
    if (row.kind === "more") {
      nodes.push(renderMoreRow(row, i, listWidth));
      consumed += MORE_ROW_HEIGHT;
      continue;
    }
    nodes.push(...renderChatRow(
      row, i, isCur, noColor, listWidth, dimRows,
      pinMarker, chatMarker, cursorPrefix, blankPrefix,
    ));
    consumed += CHAT_ROW_HEIGHT;
  }

  return <Box flexDirection="column">{nodes}</Box>;
}

function renderProjectHeader(
  row: ProjectHeader,
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
    <Text key={`p-h-${key}`} bold={isCur && !dim} dimColor={dim}>
      {isCur ? cursorPrefix : blankPrefix}{headTrunc}
    </Text>,
  );
  out.push(
    <Text key={`p-s-${key}`} dimColor>{"    "}{second}</Text>,
  );
  return out;
}

function renderMoreRow(row: MoreRow, key: number, listWidth: number): React.ReactElement {
  const text = truncateToWidth(
    `${CHILD_INDENT}  ${row.remainingCount} more`,
    listWidth - 2,
  );
  return <Text key={`m-${key}`} dimColor>{text}</Text>;
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
  // In the project-grouped layout the chat's project_path is already shown by
  // the parent project header, so we omit it from the chat row's head line.
  // We retain it as a fallback when the chat row appears without a parent (an
  // unlikely edge case but worth defending).
  const headBody = row.title
    ? `${row.title}  ${date}  ${msgs} msgs  ${sid}`
    : `${proj}  ${date}  ${msgs} msgs  ${sid}`;
  const pinPart = row.isPinned ? pinMarker : chatMarker;
  const head = pinPart + headBody;
  const headTrunc = truncateToWidth(head, listWidth - 2 - CHILD_INDENT.length);

  const snippetText = colorizeSnippet(row.snippet || "", !noColor);
  const snipTrunc = snippetText ? truncateToWidth(snippetText, listWidth - 4 - CHILD_INDENT.length) : "";

  const metaParts: string[] = [];
  if (row.gitBranch) metaParts.push("(" + row.gitBranch + ")");
  if (row.skill) metaParts.push(row.skill);
  const metaText = metaParts.length > 0
    ? truncateToWidth(metaParts.join(" · "), listWidth - 4 - CHILD_INDENT.length)
    : "";

  const previewLine = snipTrunc ||
    (row.recapText
      ? truncateToWidth("recap: " + row.recapText.replace(/\n/g, " ⏎ "), listWidth - 4 - CHILD_INDENT.length)
      : "");

  const out: React.ReactElement[] = [];
  out.push(
    <Text key={`c-h-${key}`} bold={isCur && !dim} dimColor={dim}>
      {CHILD_INDENT}{isCur ? cursorPrefix : blankPrefix}{headTrunc}
    </Text>,
  );
  if (metaText) {
    out.push(<Text key={`c-m-${key}`} dimColor>{CHILD_INDENT}{"    "}{metaText}</Text>);
  } else {
    out.push(<Text key={`c-m-${key}`}>{""}</Text>);
  }
  if (previewLine) {
    out.push(<Text key={`c-s-${key}`} dimColor>{CHILD_INDENT}{"    "}{previewLine}</Text>);
  } else {
    out.push(<Text key={`c-s-${key}`}>{""}</Text>);
  }
  return out;
}
