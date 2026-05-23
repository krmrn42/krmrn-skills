import { dieUser } from "./exit-codes.js";
import { defaultIndexPath } from "../core/db.js";
import type { Args } from "../core/types.js";
import { EXIT_OK } from "./exit-codes.js";

export interface OptionSpec {
  flags: string[];
  placeholder?: string;
  group: "Options" | "Filters" | "Output" | "Index management" | "Dangerous";
  description: string;
}

export const OPTIONS: readonly OptionSpec[] = [
  // Core
  {
    flags: ["-h", "--help"],
    group: "Options",
    description: "Show this help message and exit.",
  },
  {
    flags: ["--version"],
    group: "Options",
    description: "Print package version (from package.json) and exit.",
  },
  {
    flags: ["-i", "--interactive"],
    group: "Options",
    description:
      "Open the built-in TUI picker. Default on a TTY; this flag forces the " +
      "picker even when other inference would dispatch to one-shot. Inside the " +
      "picker: Enter resumes, Ctrl-F forks, Ctrl-R renames, Ctrl-P pins, Ctrl-T " +
      "launches in remote-control mode, Ctrl-O prints session id, Ctrl-D prints " +
      "project path, arrow keys / PgUp / PgDn navigate, Esc cancels.",
  },
  {
    flags: ["-l", "--list"],
    group: "Options",
    description:
      "Force one-shot ranked text output (the pre-default behavior). Useful on " +
      "a TTY when you want a printable list instead of the picker. Mutually " +
      "exclusive with -i.",
  },

  // Filters
  {
    flags: ["--regex"],
    placeholder: "PAT",
    group: "Filters",
    description:
      "Post-filter results with this regex (Node RegExp flavor, `m` flag). " +
      "Without a positional query, requires --scan.",
  },
  {
    flags: ["--scan"],
    group: "Filters",
    description:
      "With --regex and no positional query, full-scan all messages. Required " +
      "as an explicit acknowledgment because the scan is slow on large indexes.",
  },
  {
    flags: ["--include-tools"],
    group: "Filters",
    description:
      "Also search tool_use / tool_result rows (excluded by default). " +
      "Mutually exclusive with --only-user.",
  },
  {
    flags: ["--only-user"],
    group: "Filters",
    description:
      "Search only user rows (exclude assistant and tool rows). " +
      "Mutually exclusive with --include-tools.",
  },
  {
    flags: ["--project"],
    placeholder: "SUBSTR",
    group: "Filters",
    description: "Filter by case-insensitive substring of project name or path.",
  },
  {
    flags: ["--since"],
    placeholder: "YYYY-MM-DD",
    group: "Filters",
    description: "Only include messages on or after this date.",
  },

  // Output
  {
    flags: ["--limit"],
    placeholder: "N",
    group: "Output",
    description: "Maximum conversations returned. Default: 20.",
  },
  {
    flags: ["--format"],
    placeholder: "text|tsv",
    group: "Output",
    description:
      "Output format. Default: text on a TTY, tsv when stdout is piped.",
  },
  {
    flags: ["--no-color"],
    group: "Output",
    description: "Disable ANSI color in text output.",
  },
  {
    flags: ["--preview"],
    placeholder: "SESSION_ID",
    group: "Output",
    description:
      "Render a turn-by-turn preview of the named session and exit (read-only).",
  },

  // Index management
  {
    flags: ["--db-path"],
    placeholder: "PATH",
    group: "Index management",
    description:
      "Override the index DB path. Default: " +
      "$XDG_DATA_HOME/krmrn42-skills/chat-search/index.db (or $MULTIVAC_DB if set).",
  },
  {
    flags: ["--reindex"],
    group: "Index management",
    description:
      "Force a full rebuild of the plugin-owned index from JSONL files, then exit. " +
      "Applies only to the plugin-owned index.",
  },
  {
    flags: ["--index-status"],
    group: "Index management",
    description:
      "Print index DB path, size, message and conversation counts, last-refresh " +
      "time, and any pending files. Applies only to the plugin-owned index.",
  },

  {
    flags: ["--print-names"],
    group: "Index management",
    description:
      "Print the picker config file (sessions.json — saved names AND pin list) to " +
      "stdout and exit. Read-only; emits `{}` when no config has been written yet. " +
      "Useful for backups or shell pipelines (e.g., `multivac --print-names | jq '.pins'`).",
  },
  {
    flags: ["--unpin-all"],
    group: "Index management",
    description:
      "Clear every pinned session (sessions.json.pins = []) and exit. Leaves saved " +
      "names untouched. Idempotent. Useful as a one-shot cleanup outside the picker.",
  },
  {
    flags: ["--no-tmux"],
    group: "Options",
    description:
      "Disable the picker's Ctrl-W keybinding even when running inside tmux. Use " +
      "this if your terminal setup (nested tmux, screen-inside-tmux, IDE-embedded " +
      "shell) confuses the tmux passthrough.",
  },

  // Dangerous
  {
    flags: ["--dangerously-skip-permissions"],
    group: "Dangerous",
    description:
      "Arm an Alt+Enter binding in the picker that resumes the selected " +
      "conversation with `claude --dangerously-skip-permissions`, skipping " +
      "every permission prompt in the resumed session. Plain Enter remains " +
      "safe. Shift+Enter works on CSI-u-aware terminals (Kitty, WezTerm, " +
      "iTerm2 with CSI-u, Windows Terminal w/ enhanced kb); on terminals " +
      "that send `\\r` for both Enter and Shift+Enter, Shift+Enter behaves " +
      "as plain Enter. No effect on one-shot text output.",
  },
];

export const HELP_WIDTH = 80;
export const HELP_FLAG_COL = 28;

export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) {
      cur = w;
    } else if (cur.length + 1 + w.length <= width) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function formatOptionEntry(entry: OptionSpec): string {
  const flagPart = entry.flags.join(", ");
  return entry.placeholder ? flagPart + " " + entry.placeholder : flagPart;
}

export function buildHelp(): string {
  const synopsis = [
    "usage: multivac [-h] [--version] [-i | -l] [--regex PAT] [--scan]",
    "                [--include-tools | --only-user]",
    "                [--project SUBSTR] [--since YYYY-MM-DD] [--limit N]",
    "                [--format text|tsv] [--no-color]",
    "                [--db-path PATH] [--preview SESSION_ID]",
    "                [--reindex | --index-status]",
    "                [init | query]",
  ];
  const description =
    "Relevance-ranked full-text search across local Claude Code conversations.";
  const positional = [
    "Positional arguments:",
    "  query                       FTS5 query (phrases \"…\", prefix term*, NEAR,",
    "                              AND/OR/NOT). Optional when -i, --regex --scan,",
    "                              --preview, --reindex, or --index-status is used.",
  ];
  const subcommands = [
    "Subcommands:",
    "  init                        Install the matching Claude Code plugin via",
    "                              `claude plugin marketplace add` and",
    "                              `claude plugin install`. Falls back to",
    "                              printing the slash commands when the `claude`",
    "                              CLI is not on $PATH. To search for the",
    '                              literal word "init", use `multivac -- init`.',
  ];

  // Render OPTIONS grouped, with wrapped descriptions.
  const optionsLines: string[] = [];
  const descWidth = HELP_WIDTH - HELP_FLAG_COL - 2; // 2 for the leading "  "
  let lastGroup: string | null = null;
  for (const opt of OPTIONS) {
    if (opt.group !== lastGroup) {
      if (lastGroup !== null) optionsLines.push("");
      optionsLines.push(opt.group + ":");
      lastGroup = opt.group;
    }
    const flagStr = formatOptionEntry(opt);
    const descLines = wrapText(opt.description, descWidth);
    if (flagStr.length + 1 > HELP_FLAG_COL) {
      // Flag column overflows — put description on the next line(s) instead.
      optionsLines.push("  " + flagStr);
      for (const line of descLines) {
        optionsLines.push("  " + " ".repeat(HELP_FLAG_COL) + line);
      }
    } else {
      optionsLines.push(
        "  " + flagStr.padEnd(HELP_FLAG_COL) + descLines[0]
      );
      for (let i = 1; i < descLines.length; i++) {
        optionsLines.push("  " + " ".repeat(HELP_FLAG_COL) + descLines[i]);
      }
    }
  }

  const examples = [
    "Examples:",
    '  multivac "session timeout"',
    "  multivac -i",
    '  multivac -i "regex parse"',
    `  multivac "auth" --regex 'TOKEN_[A-F0-9]{8}'`,
    `  multivac --regex 'TOKEN_[A-F0-9]{8}' --scan`,
    '  multivac "deploy" --project alpha --since 2026-04-01',
    "  multivac init                  # install the chat-search Claude Code plugin",
    '  multivac -- init               # search for the literal word "init"',
  ];
  const notes = [
    "Notes:",
    "  TSV columns:  session_id, project, project_path, date, messages_count,",
    "                snippet, score",
    "  Constraints:  --only-user and --include-tools are mutually exclusive;",
    "                --regex without a positional query requires --scan;",
    "                --reindex and --index-status apply only to the plugin-owned",
    "                index (cannot be combined with --db-path / $MULTIVAC_DB).",
    "  Exit codes:   0 success (zero matches is success); 1 user error (bad regex,",
    "                unparseable date, conflicting flags); 2 environment error",
    "                (DB missing, schema drift, unsupported Node, no TTY for -i);",
    "                3 internal error.",
    "  Runtime:      Node.js ≥ 22.5 (uses the built-in node:sqlite module).",
    "                No npm dependencies.",
  ];
  return [
    ...synopsis,
    "",
    description,
    "",
    ...positional,
    "",
    ...subcommands,
    "",
    ...optionsLines,
    "",
    ...examples,
    "",
    ...notes,
  ].join("\n");
}

export function parseArgs(argv: readonly string[]): Args {
  const DEFAULT_DB = process.env.MULTIVAC_DB || defaultIndexPath();
  const args: Args = {
    query: "",
    interactive: false,
    list: false,
    regex: null,
    regexCompiled: null,
    scan: false,
    includeTools: false,
    onlyUser: false,
    project: null,
    since: null,
    sinceTs: 0,
    limit: 20,
    format: null,
    dbPath: DEFAULT_DB,
    preview: null,
    noColor: false,
    help: false,
    reindex: false,
    indexStatus: false,
    dangerouslySkipPermissions: false,
    printNames: false,
    unpinAll: false,
    noTmux: false,
    literalQuery: false,
  };
  const rest: string[] = [];
  // Accept both `--flag value` (space-separated) and `--flag=value` (equals form).
  // Pre-split equals form so the switch below handles only the bare flag.
  const expanded: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--") && a.length > 2 && a.includes("=")) {
      const eq = a.indexOf("=");
      expanded.push(a.slice(0, eq), a.slice(eq + 1));
    } else {
      expanded.push(a);
    }
  }
  for (let i = 0; i < expanded.length; i++) {
    const a = expanded[i];
    if (a === "--") {
      // POSIX end-of-options sentinel. Everything after `--` is a literal query
      // token, even if it would otherwise match a reserved subcommand like `init`.
      args.literalQuery = true;
      rest.push(...expanded.slice(i + 1));
      break;
    }
    // Long-form flag cases use `case "--flag":` on its own line. The drift-guard
    // test (multivac.test.sh) scans for that idiom to compare against --help.
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--version":
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        process.stdout.write(require("../../package.json").version + "\n");
        process.exit(EXIT_OK);
        break;
      case "-i":
      case "--interactive":
        args.interactive = true;
        break;
      case "-l":
      case "--list":
        args.list = true;
        break;
      case "--regex":
        args.regex = expanded[++i];
        if (args.regex === undefined) dieUser("--regex requires a pattern");
        break;
      case "--scan":
        args.scan = true;
        break;
      case "--include-tools":
        args.includeTools = true;
        break;
      case "--only-user":
        args.onlyUser = true;
        break;
      case "--project":
        args.project = expanded[++i];
        if (args.project === undefined) dieUser("--project requires a substring");
        break;
      case "--since":
        args.since = expanded[++i];
        if (args.since === undefined) dieUser("--since requires YYYY-MM-DD");
        break;
      case "--limit":
        args.limit = Number(expanded[++i]);
        if (!Number.isFinite(args.limit) || args.limit <= 0) dieUser("--limit must be a positive integer");
        args.limit = Math.floor(args.limit);
        break;
      case "--format":
        args.format = expanded[++i] as "text" | "tsv";
        if (args.format !== "text" && args.format !== "tsv") {
          dieUser("--format must be 'text' or 'tsv'");
        }
        break;
      case "--db-path":
        args.dbPath = expanded[++i];
        if (args.dbPath === undefined) dieUser("--db-path requires a path");
        break;
      case "--preview":
        args.preview = expanded[++i];
        if (args.preview === undefined) dieUser("--preview requires a session id");
        break;
      case "--no-color":
        args.noColor = true;
        break;
      case "--reindex":
        args.reindex = true;
        break;
      case "--index-status":
        args.indexStatus = true;
        break;
      case "--dangerously-skip-permissions":
        args.dangerouslySkipPermissions = true;
        break;
      case "--print-names":
        args.printNames = true;
        break;
      case "--unpin-all":
        args.unpinAll = true;
        break;
      case "--no-tmux":
        args.noTmux = true;
        break;
      default:
        if (a.startsWith("--")) {
          dieUser(`unknown flag: ${a}`);
        }
        rest.push(a);
    }
  }
  if (args.help) {
    process.stdout.write(buildHelp() + "\n");
    process.exit(EXIT_OK);
  }
  if (args.list && args.interactive) {
    dieUser("--list and -i are mutually exclusive");
  }
  if (rest.length > 1) {
    args.query = rest.join(" ");
  } else if (rest.length === 1) {
    args.query = rest[0];
  }
  return args;
}

export function selectMode(
  args: Args,
  env: { stdinTTY: boolean; stdoutTTY: boolean },
): "picker" | "one-shot" {
  if (args.list) return "one-shot";
  if (args.format !== null) return "one-shot";
  if (args.regex) return "one-shot";
  if (args.interactive) return "picker";
  if (!env.stdinTTY || !env.stdoutTTY) return "one-shot";
  return "picker";
}
