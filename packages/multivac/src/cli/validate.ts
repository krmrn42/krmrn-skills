import { dieUser } from "./exit-codes.js";
import type { Args } from "../core/types.js";

export function parseSince(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    dieUser(`--since: cannot parse '${s}' as YYYY-MM-DD`);
  }
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) {
    dieUser(`--since: cannot parse '${s}' as YYYY-MM-DD`);
  }
  return Math.floor(d.getTime() / 1000);
}

export function validateArgs(args: Args): void {
  if (args.scan && !args.regex) dieUser("--scan requires --regex.");
  if (args.regex && !args.query && !args.scan) {
    dieUser(
      "--regex without a query requires --scan to acknowledge the full-table scan.\n" +
        "Either add an FTS query (e.g., `multivac \"keyword\" --regex 'pat'`) or pass --scan."
    );
  }
  if (args.includeTools && args.onlyUser) {
    dieUser("--only-user and --include-tools cannot be combined.");
  }
  if (args.regex) {
    try {
      args.regexCompiled = new RegExp(args.regex, "m");
    } catch (e: any) {
      dieUser(`--regex: invalid pattern: ${e.message}`);
    }
  } else {
    args.regexCompiled = null;
  }
  args.sinceTs = args.since ? parseSince(args.since) : 0;
  // args.format is intentionally NOT resolved here. selectMode reads
  // `args.format !== null` as the "user explicitly set --format" signal,
  // which must remain falsy when the user did not pass --format. The
  // one-shot branch in main() resolves the default before rendering.
}
