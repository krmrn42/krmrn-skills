import type { Action, PickerMode } from "./actions.js";
import type { Selectable } from "../../core/types.js";

export interface PickerState {
  mode: PickerMode;
  query: string;
  results: Selectable[];
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

/**
 * Find the next index in `results` that points to a selectable row (not a
 * SectionHeader), starting from `from` and stepping by `dir` (±1). Returns
 * the original `from` when no selectable exists in the chosen direction.
 */
function nextSelectableIdx(
  results: Selectable[],
  from: number,
  dir: 1 | -1,
): number {
  if (results.length === 0) return 0;
  let i = from + dir;
  while (i >= 0 && i < results.length) {
    if (results[i].kind !== "section") return i;
    i += dir;
  }
  return from;
}

/** Return the first selectable index in `results`, or 0 if none exist. */
function firstSelectableIdx(results: Selectable[]): number {
  for (let i = 0; i < results.length; i++) {
    if (results[i].kind !== "section") return i;
  }
  return 0;
}

export function reducer(state: PickerState, action: Action): PickerState {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.query, cursor: 0 };
    case "set-results": {
      const initial = Math.min(state.cursor, Math.max(0, action.results.length - 1));
      // If the row at the initial cursor is a section header, jump to the
      // first selectable. If none exist (results all headers, or empty), 0.
      const targetIsSection =
        action.results.length > 0 && action.results[initial]?.kind === "section";
      const cursor = targetIsSection || initial === 0
        ? firstSelectableIdx(action.results)
        : initial;
      return {
        ...state,
        results: action.results,
        resultsError: action.error ?? null,
        cursor,
      };
    }
    case "move-cursor": {
      if (!state.results.length) return state;
      if (action.delta === 0) return state;
      const dir = action.delta > 0 ? 1 : -1;
      let next = state.cursor;
      const steps = Math.abs(action.delta);
      for (let s = 0; s < steps; s++) {
        const candidate = nextSelectableIdx(state.results, next, dir);
        if (candidate === next) break; // hit boundary
        next = candidate;
      }
      // Clamp to range.
      next = Math.max(0, Math.min(state.results.length - 1, next));
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
