import type { Selectable } from "../../core/types.js";

export type PickerMode = "browse" | "rename" | "help";

export type Action =
  | { type: "set-query"; query: string }
  | { type: "set-results"; results: Selectable[]; error?: string }
  | { type: "move-cursor"; delta: number }
  | { type: "enter-rename"; initial: string }
  | { type: "rename-input"; ch: string }
  | { type: "rename-backspace" }
  | { type: "rename-clear" }
  | { type: "commit-rename"; trimmed: string }
  | { type: "cancel-rename" }
  | { type: "enter-help" }
  | { type: "exit-help" }
  | { type: "search-pending"; pending: boolean }
  | { type: "set-dims"; cols: number; rows: number };
