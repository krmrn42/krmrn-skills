## Context

Today's `ccsearch` dispatch happens in two places: `runOneShot` in `bin/ccsearch:725-748` (the static ranked-text path), and `runPicker` in `bin/picker.js:112` (the TUI). `main()` (`bin/ccsearch:750-842`) hands off based on flags — `--preview` → preview render and exit; `--reindex`/`--index-status` → indexer branch; `args.interactive` → picker; else `runOneShot`. `runOneShot` errors out with `"no query provided"` when no positional query is supplied (`bin/ccsearch:733-738`). The picker has its own TTY guard (`bin/picker.js:116`) that returns `EXIT_ENV` if stdin or stdout is not a TTY.

`-i` was the better default for most users from day one. We never made it the default because flipping a CLI default mid-life is the kind of change that breaks pipelines if you do it carelessly. The shape of "carefully" is what this design pins down: an explicit dispatch rule with TTY detection at the right level, a small set of explicit opt-out signals, and a no-op-alias treatment of the existing `-i` flag so nothing gets removed.

This design coordinates with the parallel `improve-ccsearch-help` change, which rewrites `buildHelp()`. The help text edits this change needs (re-describing `-i` and adding `--list`) merge cleanly into either ordering; see Decisions §3.

## Goals / Non-Goals

**Goals:**

- TUI is the default on an interactive TTY. Bare `ccsearch` works (was an error before).
- Pipelines and scripts are byte-for-byte unchanged unless they explicitly want the TUI.
- `/chat-search:find` is unaffected (verified by the rules; tested as part of the change).
- A user on a TTY who wants the static ranked text has a discoverable opt-out: `--list` / `-l`, in addition to the implicit `--format=text` opt-out.
- `-i` still works; scripts continue to compose.

**Non-Goals:**

- No new TUI features. The picker is unchanged.
- No removal of any existing flag or output format.
- No environment-variable-based default override (e.g., `CCSEARCH_NO_TUI=1`). Could be added later if user demand surfaces; not in scope here.
- No TTY-detection override flag (`--force-tui` / `--force-list`). The dispatch rule is deterministic from `argv` + TTY-ness; no escape hatch needed.
- No telemetry, no "did you mean…" hints. Help text carries the migration story.

## Decisions

### Decision 1: Dispatch rule as a small, explicit predicate

We introduce a single function `selectMode(args, stdio) → "picker" | "one-shot"` near the top of `main()`. Pseudocode:

```js
function selectMode(args, stdio) {
  // Special short-circuits are handled BEFORE this function is called
  // (preview / reindex / index-status); they never reach here.
  if (args.list) return "one-shot";
  if (args.format !== null /* explicit text|tsv */) return "one-shot";
  if (args.regex) return "one-shot";
  if (args.interactive) return "picker"; // explicit -i wins over TTY inference
  if (!stdio.stdinTTY || !stdio.stdoutTTY) return "one-shot";
  return "picker"; // the new default
}
```

The function is pure; `stdio` is injected (`{ stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY }`) so it is trivially unit-testable. We put the predicate first so the test suite can exercise the matrix without spawning the binary.

`args.format` here means *explicitly set by the user*, not the default-resolved value. We keep `args.format === null` as the "not set" sentinel and move the existing `args.format = isTTY ? "text" : "tsv"` resolution (currently in `validateArgs`, `bin/ccsearch:718-720`) to happen *after* `selectMode`, only on the one-shot branch.

**Why a function and not inline branches in `main()`?** Testability and reviewability. The matrix is small but interlocking; staring at one named function with documented order beats reading two pages of nested `if` statements.

**Alternative considered: env-var override (`CCSEARCH_DEFAULT=list`).** Rejected for now. Users with strong preferences can `alias ccsearch='ccsearch --list'`; adding a config layer for a single boolean is over-built.

### Decision 2: `-i` becomes a no-op-on-TTY alias, not a removal

Keep `-i` / `--interactive` in `parseArgs`. Its semantics in the new dispatch: "force picker; if not on a TTY, error with the existing EXIT_ENV message." This preserves every existing invocation, including scripts that explicitly pass `-i`. The flag's help description changes from "open the built-in TUI picker" to "open the TUI explicitly (default on a TTY; flag kept for backward compatibility and explicit invocation in scripts)."

**Why not remove `-i`?** Two reasons. (1) The README, blog posts, examples in the wild, and users' shell history all reference `-i`. Silent removal breaks them; removal-with-error message is hostile when keeping the flag costs us one line. (2) Scripts that need the picker on terminals where TTY detection might lie (some terminal multiplexers, `expect` harnesses, etc.) can still force the picker explicitly.

### Decision 3: Add `--list` / `-l`, not a hypothetical `--no-interactive`

Naming considered: `--no-interactive`, `--no-tui`, `--print`, `--text`, `--list`. We pick `--list` because (a) it describes what the user gets — a list — not what they're opting out of, (b) it parallels common CLI vocabulary (`docker ps`, `kubectl get`, `gh repo list`), and (c) its short form `-l` is a free letter in the current flag set. `--no-interactive` reads as a double-negative inversion of `-i`; `--print` is overloaded with `--preview`.

`--list` is implemented as a plain boolean. Mutually exclusive with `-i` (parser-level check, dies with `EXIT_USER`). Not mutually exclusive with `--format` (redundant but harmless).

### Decision 4: Coordinate with `improve-ccsearch-help` rather than duplicate help work

The parallel change (`openspec/changes/improve-ccsearch-help`) rewrites `buildHelp()` to be argparse-style with a flag table. This change must update three entries: `-i` (re-described), `[query]` positional (now optional), and `--list` (new). Two merge orderings:

- If `improve-ccsearch-help` lands first: this change adds one OPTIONS-table row (`--list`) and edits one description (`-i`). Easy.
- If this change lands first: we adapt the existing `buildHelp()` string array to include `--list` and the updated `-i` line — call sites still work; `improve-ccsearch-help` will then pick those up and structure them. Also easy.

The drift-guard test that `improve-ccsearch-help` adds (parser-vs-help flag set must match) catches the case where `--list` lands in `parseArgs` without an entry in help — which is exactly the safety net we want for the new flag. Land order is not constrained; we note the dependency for whoever merges second.

### Decision 5: TTY check at dispatch, not in the picker

`picker.js:116` currently does its own TTY check. We move the check to dispatch (`selectMode`) so non-TTY invocations choose `runOneShot` instead of hitting an error. The picker's existing guard stays as a belt-and-braces check (it never runs in the default path, but it would catch a future caller that bypasses `selectMode`). This means the "no TTY for -i" error is now reachable only via explicit `-i` on a non-TTY — exactly the case it was originally written for.

### Decision 6: Test the dispatch matrix without a real TUI

`runPicker` requires a raw-mode TTY, which `bash`/`zsh` test scripts cannot easily fake. So the test strategy is:

- **Unit-style tests in shell** drive `selectMode` indirectly: invoke `bin/ccsearch` with various flag combinations and stdout pipe vs. file redirection, check the *exit code* and a marker line in stdout (e.g., `"<<one-shot>>"` set behind a hidden `--debug-mode` flag) — OR — invoke a separate `node -e "..."` snippet that requires the script as a module and calls `selectMode` directly.

We pick the second approach (module-load + call `selectMode` with synthetic `stdio`). It is precise, fast, and does not require speculative debug flags. `bin/ccsearch` already has `if (require.main === module)` (`bin/ccsearch:844`), so importing it from a test script will not auto-run `main()`. We export `selectMode` (and only `selectMode`) via a guarded `module.exports = process.env.CCSEARCH_TEST ? { selectMode } : module.exports;` pattern so production behavior is unaffected.

**Alternative considered: spawn a pty and drive it.** Out of scope. Adds dependency surface for a check that the unit-style test covers cheaper.

## Risks / Trade-offs

- **Risk: A user's shell wrapper script calls `ccsearch <query>` expecting the static text output on a TTY (e.g., piped through `awk` via `$(ccsearch foo)`).** → Mitigation: `$(...)` is command substitution, which makes stdout non-TTY → falls into one-shot, unchanged. Same for `>(...)` and explicit redirection. The only breaking case is *direct* TTY invocation; for those, the documented opt-out is `--list` or `--format=text`. Called out as a deprecation note in the README and in the `--help` text.
- **Risk: TTY detection misfires** in unusual environments (some CI runners that present TTY-like stdio, IDE-integrated terminals that lie about raw-mode capability). → Mitigation: if TTY detection says "yes" but raw mode fails, the picker's internal guard hits its existing `EXIT_ENV` path. Recoverable by `--list` or `--format=text` in that environment. Not perfect, but the failure is loud and the workaround is one flag.
- **Risk: Test suite cannot exercise the real TUI path.** → Mitigation: the unit-style test of `selectMode` covers the dispatch matrix (the part that this change introduces); the picker itself is unchanged. We accept that "user runs `ccsearch` on a real terminal and sees the TUI" is verified manually as part of §4 of `tasks.md`.
- **Trade-off: `--format` is now overloaded with two semantics**: (1) "render as text vs tsv" and (2) "implicitly opt out of TUI". The second is a side effect of (1); we document it explicitly in the `--format` help entry to avoid surprise.
- **Trade-off: bare `ccsearch` no longer fails fast.** Today's "no query provided" message did teach the user about `-i`; the new behavior just opens the picker. The picker's empty state shows "type to search" which is functionally equivalent.

## Migration Plan

1. Ship the change. CHANGELOG entry under "Breaking (UX)" listing the new default and the two opt-out paths (`--list`, `--format=text`). README "Modes" section rewritten to lead with TUI.
2. No code migration needed in callers. The only consumer in this repo (`/chat-search:find`) is unaffected by construction.
3. **Rollback**: revert `bin/ccsearch` and `bin/picker.js` to the pre-change tag. No state changes — nothing on disk or in user config depends on this default.

## Open Questions

None blocking. One nice-to-have to revisit after a few weeks of real use: should `--list` be a richer mode (e.g., `--list=top10`, `--list=tsv`) or stay as a pure boolean? Pure boolean now; richer if user feedback asks for it.
