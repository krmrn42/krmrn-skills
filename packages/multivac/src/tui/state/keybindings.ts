import type { ChatSource } from "../../sources/types.js";
import type { ResultRow } from "../../core/types.js";
import { visibleLen } from "../lib/width.js";

export type BindingCategory = "resume" | "action" | "dangerous" | "navigation";

export interface KeybindingDeps {
  dangerouslySkipPermissions: boolean;
  tmuxAvailable: boolean;
  getSource: (id: string) => ChatSource | undefined;
}

export interface Binding {
  keys: string[];
  label: string;
  category: BindingCategory;
  visible: (deps: KeybindingDeps, selectedRow?: ResultRow) => boolean;
  longHelp: string;
}

function hasResumeAction(
  deps: KeybindingDeps,
  row: ResultRow | undefined,
  action: string,
): boolean {
  if (!row) return false;
  const src = deps.getSource(row.source);
  return !!src?.resume?.actions.includes(action as never);
}

export const BINDINGS: readonly Binding[] = [
  {
    keys: ["Enter"],
    label: "resume",
    category: "resume",
    visible: (d, r) => hasResumeAction(d, r, "resume"),
    longHelp: "Spawn `claude --resume <session-id>` in the row's project directory.",
  },
  {
    keys: ["Alt-Enter", "Shift-Enter"],
    label: "dangerous",
    category: "dangerous",
    visible: (d, r) => !!d.dangerouslySkipPermissions && hasResumeAction(d, r, "dangerous"),
    longHelp: "Spawn `claude --dangerously-skip-permissions --resume <id>` — skips all permission prompts.",
  },
  {
    keys: ["Ctrl-T"],
    label: "remote-control",
    category: "action",
    visible: (d, r) => hasResumeAction(d, r, "remote-control"),
    longHelp: "Spawn `claude --remote-control [name] --resume <id>` for the selected row.",
  },
  {
    keys: ["Ctrl-W"],
    label: "tmux-window",
    category: "action",
    visible: (d, r) => !!d.tmuxAvailable && hasResumeAction(d, r, "tmux-window"),
    longHelp: "Open the resumed session in a new tmux window named after the conversation.",
  },
  {
    keys: ["Ctrl-R"],
    label: "rename",
    category: "action",
    visible: () => true,
    longHelp: "Rename the selected conversation. Saved in ~/.config/krmrn42-skills/chat-search/sessions.json.",
  },
  {
    keys: ["Ctrl-P"],
    label: "pin",
    category: "action",
    visible: () => true,
    longHelp: "Pin/unpin the selected conversation to the top of the picker list.",
  },
  {
    keys: ["Ctrl-F"],
    label: "fork",
    category: "action",
    visible: (d, r) => hasResumeAction(d, r, "fork"),
    longHelp: "Spawn `claude --fork-session --resume <id>` to create a new session id from this one.",
  },
  {
    keys: ["Ctrl-O"],
    label: "print id",
    category: "action",
    visible: () => true,
    longHelp: "Print the row's session id to stdout and exit. Useful for piping.",
  },
  {
    keys: ["Ctrl-D"],
    label: "print path",
    category: "action",
    visible: () => true,
    longHelp: "Print the row's project path to stdout and exit.",
  },
  {
    keys: ["Up/Down"],
    label: "nav",
    category: "navigation",
    visible: () => true,
    longHelp: "Move cursor up/down (also Ctrl-K / Ctrl-J).",
  },
  {
    keys: ["?"],
    label: "help",
    category: "navigation",
    visible: () => true,
    longHelp: "Toggle this binding reference overlay. Press any key to dismiss.",
  },
  {
    keys: ["Esc"],
    label: "cancel",
    category: "navigation",
    visible: () => true,
    longHelp: "Cancel the picker (exit 0 without resuming).",
  },
];

const CATEGORY_ORDER: BindingCategory[] = ["resume", "action", "dangerous", "navigation"];

type GroupedBindings = Record<BindingCategory, Binding[]>;

function groupByCategory(entries: Binding[]): GroupedBindings {
  const out: GroupedBindings = { resume: [], action: [], dangerous: [], navigation: [] };
  for (const b of entries) {
    out[b.category].push(b);
  }
  return out;
}

function formatCategoryEntries(entries: Binding[]): string {
  // Each entry renders as "<keys> <label>". Two spaces between entries in the same category.
  return entries.map((b) => b.keys.join("/") + " " + b.label).join("  ");
}

function formatBar(grouped: GroupedBindings, omit: BindingCategory[]): string {
  const omitSet = new Set(omit);
  const parts: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (omitSet.has(cat)) continue;
    const entries = grouped[cat];
    if (!entries || entries.length === 0) continue;
    parts.push(formatCategoryEntries(entries));
  }
  return parts.join("   "); // 3 spaces between categories
}

/**
 * Build the status-bar lines. Returns 1 or 2 strings depending on terminal width.
 * Matches picker.js:329-338 layout: single line when it fits, or main+nav split
 * when narrow.
 */
export function buildStatusBar(
  deps: KeybindingDeps,
  selectedRow: ResultRow | undefined,
  cols: number,
): string[] {
  const visible = BINDINGS.filter((b) => b.visible(deps, selectedRow));
  const grouped = groupByCategory(visible);
  const oneLine = formatBar(grouped, []);
  if (visibleLen(oneLine) <= cols) return [oneLine];
  // Drop navigation to line 2.
  const mainLine = formatBar(grouped, ["navigation"]);
  const navLine = formatBar(grouped, ["resume", "action", "dangerous"]);
  return [mainLine, navLine];
}
