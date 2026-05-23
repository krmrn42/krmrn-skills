import type { Action, PickerMode } from "./actions.js";
import type { ResultRow } from "../../core/types.js";

export interface PickerState {
  mode: PickerMode;
  query: string;
  results: ResultRow[];
  resultsError: string | null;
  cursor: number;
  searchPending: boolean;
  renameBuffer: string;
  dims: { cols: number; rows: number };
}

export const initialState: PickerState = {
  mode: "browse",
  query: "",
  results: [],
  resultsError: null,
  cursor: 0,
  searchPending: false,
  renameBuffer: "",
  dims: { cols: 80, rows: 24 },
};

export function reducer(state: PickerState, action: Action): PickerState {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.query, cursor: 0 };
    case "set-results": {
      const cursor = Math.min(state.cursor, Math.max(0, action.results.length - 1));
      return { ...state, results: action.results, resultsError: action.error ?? null, cursor };
    }
    case "move-cursor": {
      if (!state.results.length) return state;
      const next = Math.max(0, Math.min(state.results.length - 1, state.cursor + action.delta));
      return { ...state, cursor: next };
    }
    case "enter-rename":
      return { ...state, mode: "rename", renameBuffer: action.initial };
    case "rename-input":
      return { ...state, renameBuffer: state.renameBuffer + action.ch };
    case "rename-backspace":
      return { ...state, renameBuffer: state.renameBuffer.slice(0, -1) };
    case "rename-clear":
      return { ...state, renameBuffer: "" };
    case "commit-rename":
    case "cancel-rename":
      return { ...state, mode: "browse", renameBuffer: "" };
    case "enter-help":
      return { ...state, mode: "help" };
    case "exit-help":
      return { ...state, mode: "browse" };
    case "search-pending":
      return { ...state, searchPending: action.pending };
    case "set-dims":
      return { ...state, dims: { cols: action.cols, rows: action.rows } };
  }
}
