import React, { useReducer, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow, SessionStore } from "../core/types.js";
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

  const selectedRow: ResultRow | undefined = state.results[state.cursor];
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

  const savedName = selectedRow
    ? (props.sessionStore.names[`${selectedRow.source}:${selectedRow.sessionId}`] ?? null)
    : null;

  const runResume = useResume({
    savedName,
    tmuxAvailable: props.tmuxAvailable,
    dangerouslySkipPermissions: props.dangerouslySkipPermissions,
  });

  const togglePin = useCallback(() => {
    if (!selectedRow) return;
    const key = `${selectedRow.source}:${selectedRow.sessionId}`;
    const idx = props.sessionStore.pins.indexOf(key);
    if (idx >= 0) props.sessionStore.pins.splice(idx, 1);
    else props.sessionStore.pins.unshift(key);
    saveSessionStore(props.sessionStore);
  }, [selectedRow, props.sessionStore]);

  const commitRename = useCallback(
    (trimmed: string) => {
      if (!selectedRow) return;
      const key = `${selectedRow.source}:${selectedRow.sessionId}`;
      if (trimmed.length === 0) delete props.sessionStore.names[key];
      else props.sessionStore.names[key] = trimmed;
      saveSessionStore(props.sessionStore);
    },
    [selectedRow, props.sessionStore],
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
        if (selectedRow && props.dangerouslySkipPermissions) {
          runResume("dangerous", selectedRow);
        }
      } else if (selectedRow) {
        runResume("resume", selectedRow);
      }
      return;
    }
    if (key.ctrl && input === "t") {
      if (selectedRow) runResume("remote-control", selectedRow);
      return;
    }
    if (key.ctrl && input === "w") {
      if (selectedRow && props.tmuxAvailable) runResume("tmux-window", selectedRow);
      return;
    }
    if (key.ctrl && input === "f") {
      if (selectedRow) runResume("fork", selectedRow);
      return;
    }
    if (key.ctrl && input === "r") {
      if (selectedRow) dispatch({ type: "enter-rename", initial: savedName ?? "" });
      return;
    }
    if (key.ctrl && input === "p") {
      togglePin();
      return;
    }
    if (key.ctrl && input === "o") {
      if (selectedRow) {
        process.stdout.write(selectedRow.sessionId + "\n");
        exit();
      }
      return;
    }
    if (key.ctrl && input === "d") {
      if (selectedRow) {
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
              <PreviewPane previewText={previewText} width={previewWidth} maxRows={bodyRows} />
            </Box>
          ) : null}
        </Box>
      )}
      <StatusBar deps={deps} selectedRow={selectedRow} cols={cols} />
    </Box>
  );
}
