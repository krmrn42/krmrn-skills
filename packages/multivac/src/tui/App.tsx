import React, { useReducer, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow, DirRow, Selectable, SessionStore } from "../core/types.js";
import { reducer, initialState } from "./state/store.js";
import { PromptLine } from "./components/PromptLine.js";
import { StatusBar } from "./components/StatusBar.js";
import { ResultList } from "./components/ResultList.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { RenameModal } from "./components/RenameModal.js";
import { useSearch } from "./hooks/useSearch.js";
import { usePreview } from "./hooks/usePreview.js";
import { useResume } from "./hooks/useResume.js";
import { useResize } from "./hooks/useResize.js";
import { saveSessionStore } from "../core/sessions.js";
import { getSource } from "../sources/registry.js";

export interface AppProps {
  db: DatabaseSync;
  args: Args;
  sessionStore: SessionStore;
  dangerouslySkipPermissions: boolean;
  tmuxAvailable: boolean;
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    query: props.args.query,
  });

  useResize(dispatch);

  useSearch({
    db: props.db,
    args: props.args,
    query: state.query,
    sessionStore: props.sessionStore,
    onResults: (results, error) => dispatch({ type: "set-results", results, error }),
    onPending: (pending) => dispatch({ type: "search-pending", pending }),
  });

  const selectedRow: Selectable | undefined = state.results[state.cursor];
  // Narrowed view for code that needs ResultRow-specific fields (source, sessionId, etc.)
  const chatRow: ResultRow | undefined =
    selectedRow?.kind === "chat" ? selectedRow : undefined;
  const useColor = !props.args.noColor;
  const cols = state.dims.cols;
  // Preview is shown only when the terminal is wide enough — matches v0.6.0
  // (picker.js:530-532). Below 100 cols the list takes the full width.
  const showPreview = cols >= 100 && state.results.length > 0;
  const listWidth = showPreview ? Math.floor(cols * 0.4) : cols;
  const previewWidth = showPreview ? Math.max(20, cols - listWidth - 1) : 0;
  // Body rows = total rows minus prompt (1) and status bar (up to 2).
  // Subtract 1 more in rename mode to leave room for the RenameModal hint line.
  const reservedRows = state.mode === "rename" ? 4 : 3;
  const bodyRows = Math.max(4, state.dims.rows - reservedRows);

  const previewText = usePreview({
    db: props.db,
    row: selectedRow,
    useColor,
    width: previewWidth,
  });

  const savedName = chatRow
    ? (props.sessionStore.names[`${chatRow.source}:${chatRow.sessionId}`] ?? null)
    : null;

  const runResume = useResume({
    savedName,
    tmuxAvailable: props.tmuxAvailable,
    dangerouslySkipPermissions: props.dangerouslySkipPermissions,
  });

  const togglePin = useCallback(() => {
    if (!chatRow) return;
    const key = `${chatRow.source}:${chatRow.sessionId}`;
    const idx = props.sessionStore.pins.indexOf(key);
    if (idx >= 0) props.sessionStore.pins.splice(idx, 1);
    else props.sessionStore.pins.unshift(key);
    saveSessionStore(props.sessionStore);
  }, [chatRow, props.sessionStore]);

  const commitRename = useCallback(
    (trimmed: string) => {
      if (!chatRow) return;
      const key = `${chatRow.source}:${chatRow.sessionId}`;
      if (trimmed.length === 0) delete props.sessionStore.names[key];
      else props.sessionStore.names[key] = trimmed;
      saveSessionStore(props.sessionStore);
    },
    [chatRow, props.sessionStore],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (state.mode === "help") {
      dispatch({ type: "exit-help" });
      return;
    }

    if (state.mode === "rename") {
      if (key.return) {
        commitRename(state.renameBuffer.trim());
        dispatch({ type: "commit-rename", trimmed: state.renameBuffer.trim() });
        return;
      }
      if (key.escape) {
        dispatch({ type: "cancel-rename" });
        return;
      }
      if (key.ctrl && input === "u") {
        dispatch({ type: "rename-clear" });
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({ type: "rename-backspace" });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        dispatch({ type: "rename-input", ch: input });
      }
      return;
    }

    // browse mode
    if (key.return) {
      if (key.meta || key.shift) {
        if (chatRow && props.dangerouslySkipPermissions) {
          runResume("dangerous", chatRow);
        }
      } else if (chatRow) {
        runResume("resume", chatRow);
      } else if (selectedRow?.kind === "dir") {
        // Enter on a dir row starts a fresh chat in that dir.
        runResume("newchat", selectedRow);
      }
      return;
    }
    if (input === "N" && !key.ctrl && !key.meta) {
      if (selectedRow && selectedRow.kind !== "section") {
        runResume("newchat", selectedRow as ResultRow | DirRow);
      }
      return;
    }
    if (key.ctrl && input === "t") {
      if (chatRow) runResume("remote-control", chatRow);
      return;
    }
    if (key.ctrl && input === "w") {
      if (chatRow && props.tmuxAvailable) runResume("tmux-window", chatRow);
      // Dir-row tmux-window deferred to v0.8.2 (see CHANGELOG "Out of scope").
      return;
    }
    if (key.ctrl && input === "f") {
      if (chatRow) runResume("fork", chatRow);
      return;
    }
    if (key.ctrl && input === "r") {
      if (chatRow) dispatch({ type: "enter-rename", initial: savedName ?? "" });
      return;
    }
    if (key.ctrl && input === "p") {
      togglePin();
      return;
    }
    if (key.ctrl && input === "o") {
      if (chatRow) {
        process.stdout.write(chatRow.sessionId + "\n");
        exit();
      }
      return;
    }
    if (key.ctrl && input === "d") {
      if (chatRow) {
        process.stdout.write(chatRow.projectPath + "\n");
        exit();
      } else if (selectedRow?.kind === "dir") {
        process.stdout.write(selectedRow.projectPath + "\n");
        exit();
      }
      return;
    }
    if (input === "?") {
      dispatch({ type: "enter-help" });
      return;
    }
    if (key.escape) {
      exit();
      return;
    }
    if (key.upArrow || (key.ctrl && input === "k")) {
      dispatch({ type: "move-cursor", delta: -1 });
      return;
    }
    if (key.downArrow || (key.ctrl && input === "j")) {
      dispatch({ type: "move-cursor", delta: 1 });
      return;
    }
    if (key.backspace || key.delete) {
      dispatch({ type: "set-query", query: state.query.slice(0, -1) });
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.escape) {
      dispatch({ type: "set-query", query: state.query + input });
    }
  });

  const deps = {
    dangerouslySkipPermissions: props.dangerouslySkipPermissions,
    tmuxAvailable: props.tmuxAvailable,
    getSource,
  };

  return (
    <Box flexDirection="column">
      <PromptLine
        mode={state.mode}
        query={state.query}
        renameBuffer={state.renameBuffer}
        searchPending={state.searchPending}
      />
      {state.mode === "rename" ? <RenameModal /> : null}
      {state.mode === "help" ? (
        <HelpOverlay />
      ) : (
        <Box flexDirection="row" height={bodyRows}>
          <Box width={listWidth} height={bodyRows}>
            <ResultList
              results={state.results}
              cursor={state.cursor}
              noColor={props.args.noColor}
              listWidth={listWidth}
              maxRows={bodyRows}
              dimRows={state.mode === "rename"}
            />
          </Box>
          {showPreview ? (
            <Box width={previewWidth} height={bodyRows}>
              <PreviewPane previewText={previewText} width={previewWidth} maxRows={bodyRows}
                           noColor={props.args.noColor} />
            </Box>
          ) : null}
        </Box>
      )}
      <StatusBar deps={deps} selectedRow={selectedRow} cols={cols} />
    </Box>
  );
}
