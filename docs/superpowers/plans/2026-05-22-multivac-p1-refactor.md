# Multivac P1 Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `@krmrn42/multivac` from three JS files into a TypeScript codebase bundled with esbuild and a Ink-based picker, introducing a `ChatSource` interface as the per-tool seam, with byte-identical externally-visible behavior compared to v0.6.0.

**Architecture:** Authored TypeScript under `packages/multivac/src/`, compiled by esbuild to a single CommonJS file at `packages/multivac/dist/multivac.js`. Source-agnostic core in `core/` and `cli/`; per-tool logic isolated to `sources/<id>/`. Picker rewritten as Ink components driven by a `useReducer` store. Index schema gains a `source` column with a one-time migration via `fullReindex()` on first run.

**Tech Stack:** TypeScript 5.x, esbuild, Ink 5.x + React 18, `node:test` + `tsx` for tests, `ink-testing-library` for component tests. Runtime floor stays Node ≥ 22.5 (no bump).

**Spec reference:** [`docs/superpowers/specs/2026-05-22-multivac-architecture-refactor-design.md`](../specs/2026-05-22-multivac-architecture-refactor-design.md).

**Branching:** All work for this plan lands on a fresh branch `feat/multivac-p1-refactor` from `main`. The design doc that motivated this plan lives on `docs/multivac-refactor-spec` and is expected to merge first.

---

## File structure (locks in decomposition)

```
packages/multivac/
├── src/
│   ├── cli/
│   │   ├── main.ts                # entrypoint — orchestrates parse → index → search/picker
│   │   ├── args.ts                # OPTIONS table → buildHelp + parseArgs
│   │   ├── validate.ts            # cross-flag validation
│   │   └── exit-codes.ts          # EXIT_OK / EXIT_USER / EXIT_ENV / EXIT_INTERNAL
│   ├── core/
│   │   ├── db.ts                  # open, probeSchema, detectTimestampScale, dieEnv/dieUser
│   │   ├── schema.ts              # SCHEMA_SQL + migration detection + apply
│   │   ├── types.ts               # MessageRow, ResultRow, SourceId, ResumeAction, …
│   │   ├── format.ts              # projectDisplay, fmtDate, shortSession, colorizeSnippet
│   │   ├── search/
│   │   │   ├── fts.ts             # ftsSearch (+ dieFts, typeFilterClause, buildWhereExtras)
│   │   │   ├── regex.ts           # regexPostfilter + regexScan
│   │   │   ├── recent.ts          # recentConversations + title synth + WRAPPER_TAGS
│   │   │   └── pin-ordering.ts    # applyPinOrdering
│   │   ├── sessions.ts            # sessions.json IO + source-keyed migration
│   │   └── render/
│   │       ├── text.ts            # renderText (one-shot)
│   │       ├── tsv.ts             # renderTsv (one-shot)
│   │       └── preview.ts         # renderPreview (string-producing)
│   ├── sources/
│   │   ├── registry.ts            # known sources, ordered list
│   │   ├── types.ts               # ChatSource interface + capability types
│   │   └── claude/
│   │       ├── index.ts           # impl, default-exported ChatSource
│   │       ├── discover.ts        # listJsonlFiles + projectsRoot
│   │       ├── parse.ts           # recordToRows + flattenContentString + clipToolUseInput
│   │       ├── resume.ts          # buildClaudeArgs + spawnClaude + shellQuote + resumeOneLiner
│   │       ├── tmux.ts            # buildTmuxNewWindowCommand + sanitizeTmuxName + shellSingleQuote
│   │       └── install.ts         # runInit + claudeOnPath + detectAlreadyConfigured
│   ├── indexer/
│   │   ├── runner.ts              # runIndexer + fullReindex + indexFile (source-agnostic)
│   │   ├── state.ts               # _indexer_state CRUD + mtime helpers
│   │   └── status.ts              # getIndexStatus + renderIndexStatus + formatBytes/Time
│   ├── tui/
│   │   ├── App.tsx                # top-level component
│   │   ├── components/
│   │   │   ├── PromptLine.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── ResultList.tsx
│   │   │   ├── PreviewPane.tsx
│   │   │   ├── HelpOverlay.tsx
│   │   │   └── RenameModal.tsx
│   │   ├── state/
│   │   │   ├── store.ts           # useReducer + PickerState
│   │   │   ├── actions.ts         # Action union + creators
│   │   │   └── keybindings.ts     # BINDINGS table (typed) + buildStatusBar
│   │   ├── hooks/
│   │   │   ├── useSearch.ts       # debounced query → results
│   │   │   ├── usePreview.ts      # per-row preview cache
│   │   │   ├── useResize.ts
│   │   │   └── useResume.ts       # invokes source.resume.spawn + exits Ink
│   │   └── lib/
│   │       ├── width.ts           # truncateToWidth, visibleLen, wrapToWidth
│   │       └── ansi.ts            # any helpers Ink doesn't cover (snippet markers)
│   └── version.ts                 # populated at build time from package.json
├── test/
│   ├── multivac.test.sh           # existing CLI-surface contract test (UNCHANGED)
│   ├── unit/                      # node:test files (run via tsx)
│   │   ├── args.test.ts
│   │   ├── selectMode.test.ts
│   │   ├── recent.test.ts
│   │   ├── pinOrdering.test.ts
│   │   ├── sessions.test.ts
│   │   ├── claudeSource.test.ts
│   │   └── schema-migration.test.ts
│   ├── tui/
│   │   ├── StatusBar.test.tsx
│   │   ├── ResultList.test.tsx
│   │   └── RenameModal.test.tsx
│   └── fixtures/
│       └── fake-source/           # ChatSource impl used by source-seam test
│           └── index.ts
├── dist/
│   └── multivac.js                # committed build artifact
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

Plugin side (separate commit at the end):
- `plugins/chat-search/bin/multivac` — symlink target changes from `../../../packages/multivac/src/multivac.js` to `../../../packages/multivac/dist/multivac.js`.
- `plugins/chat-search/bin/indexer.js` — deleted (bundle is self-contained).
- `plugins/chat-search/bin/picker.js` — deleted (bundle is self-contained).

---

## Phase A: Build infrastructure

### Task 1: Branch and baseline verification

**Files:**
- None modified — verification only.

- [ ] **Step 1: Create the implementation branch from main**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/multivac-p1-refactor
```

Expected: `Switched to a new branch 'feat/multivac-p1-refactor'`.

- [ ] **Step 2: Run the existing test suite to capture the baseline**

```bash
cd packages/multivac
bash test/multivac.test.sh
```

Expected: all assertions pass. Note the test count and pass status — this is the regression floor for every later task.

- [ ] **Step 3: Capture current `--help` output for later diff**

```bash
node packages/multivac/src/multivac.js --help > /tmp/multivac-help-baseline.txt
node packages/multivac/src/multivac.js --version > /tmp/multivac-version-baseline.txt
```

Expected: `--help` writes the full reference, `--version` writes `0.6.0`. These files are the byte-identical-behavior reference for Task 32.

- [ ] **Step 4: Commit a checkpoint marker (empty) so the branch exists on remote later**

No commit needed at this step. Proceed to Task 2.

---

### Task 2: Add TypeScript + esbuild + Ink dev dependencies

**Files:**
- Modify: `packages/multivac/package.json`

- [ ] **Step 1: Add `devDependencies` and dev runtime deps to `package.json`**

The bundled deps must move into `dependencies` because esbuild will inline them at build time, but for clarity the lockfile treats them all the same way. Use `dependencies` for code that ends up in `dist/`, `devDependencies` for tooling only.

```json
"dependencies": {
  "ink": "^5.0.1",
  "react": "^18.3.1"
},
"devDependencies": {
  "@types/node": "^22.5.0",
  "@types/react": "^18.3.3",
  "esbuild": "^0.23.0",
  "ink-testing-library": "^4.0.0",
  "tsx": "^4.19.0",
  "typescript": "^5.5.0"
}
```

- [ ] **Step 2: Install**

```bash
cd packages/multivac
npm install
```

Expected: `node_modules/` populated; no errors. `package-lock.json` created.

- [ ] **Step 3: Add the lockfile to git (first install)**

```bash
git add packages/multivac/package.json packages/multivac/package-lock.json
```

Do not commit yet — Task 3 will batch this with the tsconfig.

---

### Task 3: Add `tsconfig.json`

**Files:**
- Create: `packages/multivac/tsconfig.json`

- [ ] **Step 1: Write the tsconfig**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

`"noEmit": true` is intentional — esbuild produces the bundle; `tsc` is only used as a type-checker via `npm run typecheck`.

- [ ] **Step 2: Verify it parses**

```bash
cd packages/multivac
npx tsc --noEmit --project tsconfig.json
```

Expected: exits 0 (no .ts files yet, so nothing to type-check; no errors).

- [ ] **Step 3: Commit Tasks 2 + 3 together**

```bash
git add packages/multivac/package.json packages/multivac/package-lock.json packages/multivac/tsconfig.json
git commit -m "chore(multivac): add TypeScript + esbuild + Ink dev setup"
```

---

### Task 4: Add esbuild config

**Files:**
- Create: `packages/multivac/esbuild.config.mjs`

- [ ] **Step 1: Write the esbuild script**

```javascript
// esbuild.config.mjs — bundles src/cli/main.ts into dist/multivac.js
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

await build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22.5",
  format: "cjs",
  outfile: "dist/multivac.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["node:*"],
  define: {
    "process.env.MULTIVAC_VERSION": JSON.stringify(pkg.version),
  },
  minify: false,           // keep readable — debuggability over bytes
  sourcemap: false,        // committed artifact stays one file
  legalComments: "inline", // preserve license headers from deps
  logLevel: "info",
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/multivac/esbuild.config.mjs
git commit -m "chore(multivac): add esbuild bundle config"
```

---

### Task 5: Add npm scripts

**Files:**
- Modify: `packages/multivac/package.json`

- [ ] **Step 1: Add `scripts` block**

Insert above `"bin"` in `package.json`:

```json
"scripts": {
  "build": "node esbuild.config.mjs && chmod +x dist/multivac.js",
  "typecheck": "tsc --noEmit",
  "test": "node --import tsx --test 'test/unit/**/*.test.ts' 'test/tui/**/*.test.tsx'",
  "test:sh": "bash test/multivac.test.sh",
  "test:all": "npm run typecheck && npm run test && npm run build && npm run test:sh",
  "prepublishOnly": "npm run build"
}
```

- [ ] **Step 2: Verify `npm run typecheck` works (no .ts files yet → no-op pass)**

```bash
cd packages/multivac && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/multivac/package.json
git commit -m "chore(multivac): add build/test/typecheck npm scripts"
```

---

### Task 6: Smoke-test the build pipeline with a placeholder entry

**Files:**
- Create: `packages/multivac/src/cli/main.ts` (placeholder; replaced in Task 31)

- [ ] **Step 1: Write a minimal entry point**

```typescript
// src/cli/main.ts — placeholder, replaced in Task 31.
const version = process.env.MULTIVAC_VERSION ?? "0.0.0-dev";

function main(): number {
  process.stdout.write(`multivac scaffold ok (v${version})\n`);
  return 0;
}

process.exit(main());
```

- [ ] **Step 2: Run the build**

```bash
cd packages/multivac
npm run build
```

Expected: `dist/multivac.js` exists, starts with `#!/usr/bin/env node`, is executable.

- [ ] **Step 3: Execute the built bundle**

```bash
./dist/multivac.js
```

Expected: prints `multivac scaffold ok (v0.6.0)` and exits 0. (The MULTIVAC_VERSION define inlines the current package version into the bundle.)

- [ ] **Step 4: Commit**

```bash
git add packages/multivac/src/cli/main.ts
git commit -m "chore(multivac): scaffold TypeScript entry + verify esbuild pipeline"
```

Do not commit `dist/` yet — Task 35 is the dist-commit task. Add `dist/` to `.gitignore` temporarily; remove that ignore in Task 35.

- [ ] **Step 5: Add `dist/` to a temporary `.gitignore`**

```bash
cat > packages/multivac/.gitignore <<'EOF'
node_modules/
# dist/ is intentionally NOT ignored — removed in Task 35.
# During development, commit dist/ only after a green test:all run.
dist/
EOF
git add packages/multivac/.gitignore
git commit -m "chore(multivac): ignore dist/ during development (removed in final task)"
```

---

## Phase B: Core types and ChatSource interface

### Task 7: Define core types and exit codes

**Files:**
- Create: `packages/multivac/src/cli/exit-codes.ts`
- Create: `packages/multivac/src/core/types.ts`
- Create: `packages/multivac/src/sources/types.ts`

- [ ] **Step 1: Write `cli/exit-codes.ts`**

```typescript
export const EXIT_OK = 0;
export const EXIT_USER = 1;
export const EXIT_ENV = 2;
export const EXIT_INTERNAL = 3;

export function dieUser(msg: string): never {
  process.stderr.write("multivac: " + msg + "\n");
  process.exit(EXIT_USER);
}

export function dieEnv(msg: string): never {
  process.stderr.write("multivac: " + msg + "\n");
  process.exit(EXIT_ENV);
}
```

- [ ] **Step 2: Write `core/types.ts`** — all cross-module data shapes

```typescript
export type SourceId = string; // 'claude' | 'codex' | 'aider' | …

export type ResumeAction =
  | "resume"
  | "fork"
  | "dangerous"
  | "remote-control"
  | "tmux-window";

export interface MessageRow {
  id: string;                 // ${source}:${sessionId}:${uuid}:${blockIdx}
  source: SourceId;
  conversationId: string;
  projectPath: string;
  projectName: string;
  timestamp: number;
  type: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  messageUuid: string;
  parentUuid: string | null;
}

export interface ResultRow {
  source: SourceId;
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: number;
  msgCount: number;
  snippet: string;
  score: number;
  title?: string | null;
  isPinned?: boolean;
}

export interface SessionStore {
  version: number;
  names: Record<string, string>; // key: ${source}:${sessionId}
  pins: string[];                // values: ${source}:${sessionId}
}

export interface Args {
  query: string;
  interactive: boolean;
  list: boolean;
  regex: string | null;
  regexCompiled: RegExp | null;
  scan: boolean;
  includeTools: boolean;
  onlyUser: boolean;
  project: string | null;
  since: string | null;
  sinceTs: number;
  limit: number;
  format: "text" | "tsv" | null;
  dbPath: string;
  preview: string | null;
  noColor: boolean;
  help: boolean;
  reindex: boolean;
  indexStatus: boolean;
  dangerouslySkipPermissions: boolean;
  printNames: boolean;
  unpinAll: boolean;
  noTmux: boolean;
  literalQuery: boolean;
}
```

- [ ] **Step 3: Write `sources/types.ts`** — the ChatSource interface

```typescript
import type { MessageRow, ResultRow, SourceId, ResumeAction } from "../core/types.js";

export interface SourceFile {
  path: string;
  mtimeMs: number;
}

export interface ResumeOpts {
  savedName: string | null;
  tmuxAvailable: boolean;
  dangerouslySkipPermissions: boolean;
}

export interface SpawnResult {
  status: number;       // exit code to propagate (0..3)
  stderr?: string;      // optional diagnostic to write before exit
}

export interface InstallResult {
  ok: boolean;
  message: string;      // displayed to user
}

export interface ChatSource {
  readonly id: SourceId;
  readonly displayName: string;

  discover(): Promise<SourceFile[]>;
  parse(file: SourceFile): AsyncIterable<Omit<MessageRow, "id" | "source">>;

  readonly resume?: {
    actions: ResumeAction[];
    spawn(row: ResultRow, action: ResumeAction, opts: ResumeOpts): SpawnResult;
  };

  readonly install?: {
    run(): Promise<InstallResult>;
    manualInstructions(): string;
  };
}
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/multivac && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/multivac/src/cli/exit-codes.ts packages/multivac/src/core/types.ts packages/multivac/src/sources/types.ts
git commit -m "feat(multivac): define core types and ChatSource interface"
```

---

### Task 8: ChatSource registry skeleton

**Files:**
- Create: `packages/multivac/src/sources/registry.ts`
- Create: `packages/multivac/test/unit/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/registry.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRegistry, getSource } from "../../src/sources/registry.js";

test("registry exposes claude by default", () => {
  const reg = getRegistry();
  assert.equal(reg.length, 1);
  assert.equal(reg[0].id, "claude");
  assert.equal(reg[0].displayName, "Claude Code");
});

test("getSource('claude') returns the claude source", () => {
  const s = getSource("claude");
  assert.ok(s);
  assert.equal(s.id, "claude");
});

test("getSource('nope') returns undefined", () => {
  assert.equal(getSource("nope"), undefined);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd packages/multivac && npm test 2>&1 | head -20
```

Expected: TypeScript error or test failure — `registry.ts` does not exist yet.

- [ ] **Step 3: Write `sources/registry.ts`**

```typescript
// src/sources/registry.ts
import type { ChatSource, SourceId } from "./types.js";
import claudeSource from "./claude/index.js";

// Ordered: discovery + indexer pass walk this in order. Claude first because
// it's the source the v0.6.0 user already has data for.
const REGISTRY: ChatSource[] = [claudeSource];

export function getRegistry(): readonly ChatSource[] {
  return REGISTRY;
}

export function getSource(id: SourceId): ChatSource | undefined {
  return REGISTRY.find((s) => s.id === id);
}
```

- [ ] **Step 4: Write a temporary stub for `sources/claude/index.ts`** (real impl lands in Task 20)

```typescript
// src/sources/claude/index.ts — stub, fleshed out in Task 20.
import type { ChatSource } from "../types.js";

const claudeSource: ChatSource = {
  id: "claude",
  displayName: "Claude Code",
  async discover() { return []; },
  async *parse() { /* stub */ },
};

export default claudeSource;
```

- [ ] **Step 5: Run — expect pass**

```bash
cd packages/multivac && npm test
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/multivac/src/sources/registry.ts packages/multivac/src/sources/claude/index.ts packages/multivac/test/unit/registry.test.ts
git commit -m "feat(multivac): add source registry with claude stub"
```

---

## Phase C: Port pure helpers and DB layer

Each task in this phase has the same shape: write the TS module mirroring an existing JS function, write a TS unit test, run it, commit. The JS source remains untouched until Task 31 — until then `src/multivac.js` is still the live CLI and `bash test/multivac.test.sh` is the regression floor.

### Task 9: Port format helpers

**Files:**
- Create: `packages/multivac/src/core/format.ts`
- Create: `packages/multivac/test/unit/format.test.ts`

**Source:** `packages/multivac/src/multivac.js:257-298, 277-284` (functions `projectDisplay`, `shortSession`, `fmtDate`, `colorizeSnippet`).

- [ ] **Step 1: Write `src/core/format.ts`**

```typescript
export const SNIPPET_OPEN = "<<<";
export const SNIPPET_CLOSE = ">>>";

export const ANSI_BOLD = "\x1b[1m";
export const ANSI_DIM = "\x1b[2m";
export const ANSI_RESET = "\x1b[0m";

export function projectDisplay(projectPath: string, projectName: string): string {
  if (!projectPath) return projectName || "?";
  const parts = projectPath.split("/").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return projectName || projectPath;
}

export function shortSession(sid: string | null | undefined): string {
  return sid ? sid.slice(0, 8) : "????????";
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "????-??-??";
  let n = ts;
  if (n > 10_000_000_000) n = Math.floor(n / 1000);
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "????-??-??";
  return d.toISOString().slice(0, 10);
}

export function colorizeSnippet(snippet: string, useColor: boolean): string {
  if (!snippet) return "";
  let s = snippet;
  if (useColor) {
    s = s.split(SNIPPET_OPEN).join(ANSI_BOLD).split(SNIPPET_CLOSE).join(ANSI_RESET);
  }
  return s.split(/\s+/).filter(Boolean).join(" ");
}
```

- [ ] **Step 2: Write the unit test mirroring JS behavior**

```typescript
// test/unit/format.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectDisplay, shortSession, fmtDate, colorizeSnippet,
  ANSI_BOLD, ANSI_RESET, SNIPPET_OPEN, SNIPPET_CLOSE,
} from "../../src/core/format.js";

test("projectDisplay: 2+ path parts → last two", () => {
  assert.equal(projectDisplay("/home/user/project", ""), "user/project");
});

test("projectDisplay: 1 path part → project name fallback", () => {
  assert.equal(projectDisplay("/oneproj", "Oneproj"), "Oneproj");
});

test("projectDisplay: empty path → name or '?'", () => {
  assert.equal(projectDisplay("", "Foo"), "Foo");
  assert.equal(projectDisplay("", ""), "?");
});

test("shortSession truncates to 8 chars", () => {
  assert.equal(shortSession("abcdef1234567890"), "abcdef12");
  assert.equal(shortSession(""), "????????");
  assert.equal(shortSession(null), "????????");
});

test("fmtDate handles seconds + ms", () => {
  const ms = 1700000000000;
  const s = 1700000000;
  assert.equal(fmtDate(ms), fmtDate(s));
  assert.equal(fmtDate(0), "????-??-??");
});

test("colorizeSnippet with color wraps markers in ANSI", () => {
  const input = `foo ${SNIPPET_OPEN}bar${SNIPPET_CLOSE} baz`;
  const out = colorizeSnippet(input, true);
  assert.ok(out.includes(ANSI_BOLD));
  assert.ok(out.includes(ANSI_RESET));
});

test("colorizeSnippet without color preserves marker text", () => {
  const out = colorizeSnippet(`foo ${SNIPPET_OPEN}x${SNIPPET_CLOSE}`, false);
  assert.equal(out, `foo ${SNIPPET_OPEN}x${SNIPPET_CLOSE}`);
});
```

- [ ] **Step 3: Run tests**

```bash
cd packages/multivac && npm test
```

Expected: all format tests pass (plus the registry tests from Task 8).

- [ ] **Step 4: Commit**

```bash
git add packages/multivac/src/core/format.ts packages/multivac/test/unit/format.test.ts
git commit -m "refactor(multivac): port format helpers to TypeScript"
```

---

### Task 10: Port DB layer

**Files:**
- Create: `packages/multivac/src/core/db.ts`
- Create: `packages/multivac/src/core/schema.ts`

**Source:** `packages/multivac/src/multivac.js:83-242` (defaultIndexPath, isPluginOwnedDb, openDb, probeSchema, detectTimestampScale, EXPECTED_TABLES, EXPECTED_COLUMNS).

- [ ] **Step 1: Write `src/core/schema.ts`** (kept separate from runtime DB ops so migrations can be unit-tested in isolation)

```typescript
import type { DatabaseSync } from "node:sqlite";

export const EXPECTED_TABLES = new Set(["messages", "messages_fts"]);

// Includes the new `source` column added by P1 migration v2.
export const EXPECTED_COLUMNS = new Set([
  "id", "conversation_id", "project_path", "project_name",
  "timestamp", "type", "content", "message_uuid", "parent_uuid",
  "source",
]);

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path    TEXT NOT NULL,
  project_name    TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  type            TEXT NOT NULL,
  content         TEXT,
  message_uuid    TEXT NOT NULL,
  parent_uuid     TEXT,
  source          TEXT NOT NULL DEFAULT 'claude'
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp    ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_type         ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_source       ON messages(source);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(id UNINDEXED, content);
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, content) VALUES (new.id, COALESCE(new.content, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
  INSERT INTO messages_fts(id, content) VALUES (new.id, COALESCE(new.content, ''));
END;
CREATE TABLE IF NOT EXISTS _indexer_state (
  jsonl_path TEXT PRIMARY KEY,
  mtime_ms   INTEGER NOT NULL,
  rows       INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'claude'
);
`;

// detectMigrationNeeded returns the migration version we need to run, or 0 if
// the schema is current. The only check P1 cares about is the presence of the
// `source` column on `messages`.
export function detectMigrationNeeded(db: DatabaseSync): number {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
  ).all();
  if (tables.length === 0) return 0; // fresh DB, schema bootstrap will create it
  const cols = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  const hasSource = cols.some((c) => c.name === "source");
  return hasSource ? 0 : 2; // 2 = "add source column" migration
}
```

- [ ] **Step 2: Write `src/core/db.ts`**

```typescript
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dieEnv } from "../cli/exit-codes.js";
import { EXPECTED_TABLES, EXPECTED_COLUMNS } from "./schema.js";

export function defaultIndexPath(): string {
  const xdg = process.env.XDG_DATA_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(base, "krmrn42-skills", "chat-search", "index.db");
}

export const PLUGIN_DEFAULT_DB = defaultIndexPath();

export function isPluginOwnedDb(p: string): boolean {
  return p === PLUGIN_DEFAULT_DB;
}

export interface OpenDbOpts { readWrite?: boolean }

export function openDb(dbPath: string, opts: OpenDbOpts = {}): DatabaseSync {
  const usingPluginOwned = isPluginOwnedDb(dbPath);
  if (!fs.existsSync(dbPath)) {
    if (usingPluginOwned) {
      try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); }
      catch (e: any) { dieEnv(`could not create index directory at ${path.dirname(dbPath)}: ${e.message}`); }
    } else {
      dieEnv(
        `${dbPath} not found.\n` +
          `Use Claude Code at least once to create the database,\n` +
          `or pass --db-path / set MULTIVAC_DB.`
      );
    }
  }
  const readOnly = opts.readWrite ? false : !usingPluginOwned;
  try { return new DatabaseSync(dbPath, { readOnly }); }
  catch (e: any) { dieEnv(`could not open ${dbPath}: ${e.message}`); }
}

export function probeSchema(db: DatabaseSync): void {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') " +
      "AND name IN ('messages','messages_fts')"
  ).all() as Array<{ name: string }>;
  const found = new Set(rows.map((r) => r.name));
  const missingTables = [...EXPECTED_TABLES].filter((t) => !found.has(t)).sort();
  if (missingTables.length) {
    dieEnv(
      `schema does not match expected layout — missing table(s): ${missingTables.join(", ")}.\n` +
        `This usually means Claude Code has been updated and chat-search needs to update too.`
    );
  }
  const cols = new Set(
    (db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>).map((r) => r.name)
  );
  const missingCols = [...EXPECTED_COLUMNS].filter((c) => !cols.has(c)).sort();
  if (missingCols.length) {
    dieEnv(
      `schema does not match expected layout — missing column(s) in \`messages\`: ` +
        `${missingCols.join(", ")}.`
    );
  }
}

export function detectTimestampScale(db: DatabaseSync): number {
  const row = db.prepare("SELECT MAX(timestamp) AS m FROM messages").get() as { m: number | null } | undefined;
  if (!row || !row.m) return 1000;
  return row.m > 10_000_000_000 ? 1000 : 1;
}
```

- [ ] **Step 3: Typecheck and commit (no test here — DB layer is exercised by integration tests later)**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/core/db.ts packages/multivac/src/core/schema.ts
git commit -m "refactor(multivac): port DB layer + schema with source column to TypeScript"
```

---

### Task 11: Port `applyPinOrdering`

**Files:**
- Create: `packages/multivac/src/core/search/pin-ordering.ts`
- Create: `packages/multivac/test/unit/pinOrdering.test.ts`

**Source:** `packages/multivac/src/multivac.js:597-621`.

- [ ] **Step 1: Write `pin-ordering.ts`**

```typescript
import type { ResultRow, SessionStore } from "../types.js";

// Pins are now keyed by `${source}:${sessionId}`. Construct that key for the
// row being considered against the pin list.
function pinKey(row: ResultRow): string {
  return `${row.source}:${row.sessionId}`;
}

export function applyPinOrdering(
  rows: ResultRow[],
  sessionStore: SessionStore | null | undefined,
  limit: number,
): ResultRow[] {
  const pins = sessionStore?.pins && Array.isArray(sessionStore.pins) ? sessionStore.pins : [];
  if (!pins.length) {
    return rows.slice(0, Math.max(0, limit | 0)).map((r) => ({ ...r, isPinned: false }));
  }
  const pinIndex = new Map<string, number>();
  for (let i = 0; i < pins.length; i++) pinIndex.set(pins[i], i);
  const pinned: ResultRow[] = [];
  const unpinned: ResultRow[] = [];
  for (const r of rows) {
    if (pinIndex.has(pinKey(r))) pinned.push({ ...r, isPinned: true });
    else unpinned.push({ ...r, isPinned: false });
  }
  pinned.sort((a, b) => (pinIndex.get(pinKey(a)) ?? 0) - (pinIndex.get(pinKey(b)) ?? 0));
  return pinned.concat(unpinned).slice(0, Math.max(0, limit | 0));
}
```

- [ ] **Step 2: Write tests (mirror current behavior plus new keying)**

```typescript
// test/unit/pinOrdering.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPinOrdering } from "../../src/core/search/pin-ordering.js";
import type { ResultRow, SessionStore } from "../../src/core/types.js";

function row(source: string, id: string): ResultRow {
  return {
    source, sessionId: id, projectPath: "", projectName: "",
    lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
}

test("no pins → all rows returned, none marked pinned", () => {
  const rows = [row("claude", "a"), row("claude", "b")];
  const out = applyPinOrdering(rows, { version: 1, names: {}, pins: [] }, 10);
  assert.equal(out.length, 2);
  assert.equal(out[0].isPinned, false);
});

test("pinned row floats to top in pin order", () => {
  const rows = [row("claude", "a"), row("claude", "b"), row("claude", "c")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:c", "claude:a"] };
  const out = applyPinOrdering(rows, store, 10);
  assert.deepEqual(out.map((r) => r.sessionId), ["c", "a", "b"]);
  assert.equal(out[0].isPinned, true);
  assert.equal(out[1].isPinned, true);
  assert.equal(out[2].isPinned, false);
});

test("limit caps total including pinned", () => {
  const rows = [row("claude", "a"), row("claude", "b"), row("claude", "c")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:c"] };
  const out = applyPinOrdering(rows, store, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].sessionId, "c");
});

test("source-keyed pin does not match a different source", () => {
  const rows = [row("codex", "a"), row("claude", "a")];
  const store: SessionStore = { version: 1, names: {}, pins: ["claude:a"] };
  const out = applyPinOrdering(rows, store, 10);
  assert.equal(out[0].sessionId, "a");
  assert.equal(out[0].source, "claude");
  assert.equal(out[0].isPinned, true);
  assert.equal(out[1].isPinned, false);
});
```

- [ ] **Step 3: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/core/search/pin-ordering.ts packages/multivac/test/unit/pinOrdering.test.ts
git commit -m "refactor(multivac): port applyPinOrdering with source-keyed pins"
```

---

### Task 12: Port sessions IO with migration

**Files:**
- Create: `packages/multivac/src/core/sessions.ts`
- Create: `packages/multivac/test/unit/sessions.test.ts`

**Source:** `packages/multivac/src/multivac.js:92-149` (sessionsConfigPath, emptySessionStore, loadSessionStore, saveSessionStore) plus new key-prefix migration.

- [ ] **Step 1: Write `sessions.ts`**

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SessionStore } from "./types.js";

export function sessionsConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "krmrn42-skills", "chat-search", "sessions.json");
}

export function emptySessionStore(): SessionStore {
  return { version: 1, names: {}, pins: [] };
}

// migrateLegacyKeys rewrites bare-id keys to `claude:${id}`. Returns true if
// any keys were rewritten (signals the caller to persist).
export function migrateLegacyKeys(store: SessionStore): boolean {
  let changed = false;
  const newNames: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.names)) {
    if (k.includes(":")) {
      newNames[k] = v;
    } else {
      newNames[`claude:${k}`] = v;
      changed = true;
    }
  }
  store.names = newNames;
  const newPins = store.pins.map((p) => {
    if (p.includes(":")) return p;
    changed = true;
    return `claude:${p}`;
  });
  store.pins = newPins;
  return changed;
}

export function loadSessionStore(configPath?: string): SessionStore {
  const p = configPath || sessionsConfigPath();
  let raw: string;
  try { raw = fs.readFileSync(p, "utf8"); }
  catch (e: any) {
    if (e?.code === "ENOENT") return emptySessionStore();
    process.stderr.write(`multivac: could not read ${p}: ${e.message}\n`);
    return emptySessionStore();
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e: any) {
    process.stderr.write(`multivac: ${p} is not valid JSON (${e.message}); using empty config\n`);
    return emptySessionStore();
  }
  const store = emptySessionStore();
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.version === "number") store.version = obj.version;
    if (obj.names && typeof obj.names === "object" && !Array.isArray(obj.names)) {
      for (const [k, v] of Object.entries(obj.names as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0) store.names[k] = v;
      }
    }
    if (Array.isArray(obj.pins)) {
      for (const pin of obj.pins) {
        if (typeof pin === "string" && pin.length > 0) store.pins.push(pin);
      }
    }
  }
  // Apply legacy-key migration and persist if anything changed.
  if (migrateLegacyKeys(store)) {
    try { saveSessionStore(store, p); }
    catch (e: any) {
      process.stderr.write(`multivac: could not persist sessions.json migration: ${e.message}\n`);
    }
  }
  return store;
}

export function saveSessionStore(store: SessionStore, configPath?: string): void {
  const p = configPath || sessionsConfigPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = p + ".tmp";
  const body = JSON.stringify(store, null, 2) + "\n";
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, p);
}
```

- [ ] **Step 2: Write the migration test**

```typescript
// test/unit/sessions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadSessionStore, saveSessionStore, migrateLegacyKeys, emptySessionStore,
} from "../../src/core/sessions.js";

function tmpPath(): string {
  return path.join(os.tmpdir(), `multivac-sessions-${Date.now()}-${Math.random()}.json`);
}

test("migrateLegacyKeys: bare ids get `claude:` prefix", () => {
  const store = { version: 1, names: { abc: "Foo", "claude:xyz": "Bar" }, pins: ["abc", "claude:xyz"] };
  const changed = migrateLegacyKeys(store);
  assert.equal(changed, true);
  assert.deepEqual(store.names, { "claude:abc": "Foo", "claude:xyz": "Bar" });
  assert.deepEqual(store.pins, ["claude:abc", "claude:xyz"]);
});

test("migrateLegacyKeys: already-migrated store is unchanged", () => {
  const store = { version: 1, names: { "claude:a": "X" }, pins: ["claude:a"] };
  const changed = migrateLegacyKeys(store);
  assert.equal(changed, false);
});

test("loadSessionStore persists migration to disk", () => {
  const p = tmpPath();
  fs.writeFileSync(p, JSON.stringify({ version: 1, names: { abc: "Foo" }, pins: ["abc"] }));
  try {
    const loaded = loadSessionStore(p);
    assert.deepEqual(loaded.names, { "claude:abc": "Foo" });
    assert.deepEqual(loaded.pins, ["claude:abc"]);
    // Re-read from disk to confirm persistence.
    const onDisk = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.deepEqual(onDisk.names, { "claude:abc": "Foo" });
  } finally {
    fs.unlinkSync(p);
  }
});

test("loadSessionStore returns empty store when file is missing", () => {
  const store = loadSessionStore(tmpPath() + ".missing");
  assert.deepEqual(store, emptySessionStore());
});

test("saveSessionStore writes atomically (no .tmp leftover)", () => {
  const p = tmpPath();
  try {
    saveSessionStore({ version: 1, names: {}, pins: [] }, p);
    assert.ok(fs.existsSync(p));
    assert.equal(fs.existsSync(p + ".tmp"), false);
  } finally {
    fs.unlinkSync(p);
  }
});
```

- [ ] **Step 3: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/core/sessions.ts packages/multivac/test/unit/sessions.test.ts
git commit -m "refactor(multivac): port sessions IO + source-keyed migration"
```

---

### Task 13: Port search/fts.ts

**Files:**
- Create: `packages/multivac/src/core/search/fts.ts`

**Source:** `packages/multivac/src/multivac.js:316-453` (typeFilterClause, dieFts, buildWhereExtras, ftsSearch, fillMeta).

- [ ] **Step 1: Write `fts.ts`**

```typescript
import type { DatabaseSync } from "node:sqlite";
import type { Args, ResultRow, SessionStore } from "../types.js";
import { SNIPPET_OPEN, SNIPPET_CLOSE } from "../format.js";
import { applyPinOrdering } from "./pin-ordering.js";
import { dieUser } from "../../cli/exit-codes.js";

interface TypeClause { sql: string; params: string[]; }

export function typeFilterClause(includeTools: boolean, onlyUser: boolean): TypeClause {
  if (onlyUser) return { sql: "m.type = ?", params: ["user"] };
  if (includeTools)
    return { sql: "m.type IN (?, ?, ?, ?)", params: ["user", "assistant", "tool_use", "tool_result"] };
  return { sql: "m.type IN (?, ?)", params: ["user", "assistant"] };
}

export function dieFts(query: string, err: Error): never {
  const msg = err.message || String(err);
  if (/no such column|fts5|syntax error/i.test(msg)) {
    let suggestion = "";
    if (query.includes("-") && !(query.startsWith('"') && query.endsWith('"'))) {
      suggestion =
        `\nFTS5 treats '-' as NOT and '"…"' as a phrase. ` +
        `To search for the literal phrase, quote it:\n    multivac '"${query}"'`;
    }
    dieUser(`FTS5 query error: ${msg}${suggestion}`);
  }
  dieUser(`FTS5 query error: ${msg}`);
}

interface WhereExtras { sql: string; params: (string | number)[]; }

export function buildWhereExtras(args: Args): WhereExtras {
  const extras: string[] = [];
  const params: (string | number)[] = [];
  if (args.since) {
    extras.push("m.timestamp >= ?");
    params.push(args.sinceTs);
  }
  if (args.project) {
    extras.push("(LOWER(m.project_name) LIKE ? OR LOWER(m.project_path) LIKE ?)");
    const like = `%${args.project.toLowerCase()}%`;
    params.push(like, like);
  }
  return { sql: extras.length ? "AND " + extras.join(" AND ") : "", params };
}

function fillMeta(db: DatabaseSync, results: ResultRow[]): ResultRow[] {
  const stmt = db.prepare(
    "SELECT COUNT(*) AS c, MAX(timestamp) AS t FROM messages WHERE conversation_id = ? AND source = ?"
  );
  for (const r of results) {
    const row = stmt.get(r.sessionId, r.source) as { c: number; t: number } | undefined;
    r.msgCount = row?.c ?? 0;
    r.lastActivity = row?.t ?? 0;
  }
  return results;
}

export interface FtsSearchArgs extends Args {
  sessionStore?: SessionStore | null;
}

export function ftsSearch(db: DatabaseSync, args: FtsSearchArgs): ResultRow[] {
  const { sql: typeSql, params: typeParams } = typeFilterClause(args.includeTools, args.onlyUser);
  const { sql: whereExtraSql, params: extraParams } = buildWhereExtras(args);
  const innerLimit = Math.max(args.limit * 50, 500);

  const sql = `
SELECT
  m.source AS source,
  m.conversation_id AS conversation_id,
  m.project_path AS project_path,
  m.project_name AS project_name,
  m.timestamp AS timestamp,
  snippet(messages_fts, 1, ?, ?, '…', 12) AS snippet,
  bm25(messages_fts) AS score
FROM messages_fts
JOIN messages m ON m.id = messages_fts.id
WHERE messages_fts MATCH ?
  AND ${typeSql}
  ${whereExtraSql}
ORDER BY bm25(messages_fts)
LIMIT ?
`;
  const params = [SNIPPET_OPEN, SNIPPET_CLOSE, args.query, ...typeParams, ...extraParams, innerLimit];
  let rows: any[];
  try { rows = db.prepare(sql).all(...params); }
  catch (e: any) { dieFts(args.query, e); }

  const seen = new Map<string, ResultRow>();
  for (const r of rows) {
    const key = `${r.source}:${r.conversation_id}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      source: r.source,
      sessionId: r.conversation_id,
      projectPath: r.project_path || "",
      projectName: r.project_name || "",
      lastActivity: 0,
      msgCount: 0,
      snippet: r.snippet || "",
      score: r.score,
    });
    if (seen.size >= args.limit) break;
  }
  const filled = fillMeta(db, [...seen.values()]);
  return applyPinOrdering(filled, args.sessionStore, args.limit);
}
```

- [ ] **Step 2: Typecheck (full integration test deferred to Task 31's end-to-end run)**

```bash
cd packages/multivac && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/multivac/src/core/search/fts.ts
git commit -m "refactor(multivac): port FTS search to TypeScript with source-aware dedup"
```

---

### Task 14: Port search/regex.ts (regexPostfilter + regexScan)

**Files:**
- Create: `packages/multivac/src/core/search/regex.ts`

**Source:** `packages/multivac/src/multivac.js:406-521`.

- [ ] **Step 1: Write `regex.ts`** following the same shape as `fts.ts`. Two exports: `regexPostfilter(db, args, pattern)` and `regexScan(db, args, pattern)`. Both:

  1. Build `typeSql` + `whereExtraSql` via the helpers in `fts.ts` (re-export them or duplicate locally; pick re-export — `import { typeFilterClause, buildWhereExtras } from "./fts.js"`).
  2. SELECT include `m.source` and the dedup map keys on `${source}:${conversation_id}`.
  3. `regexScan` keeps the progress-printing logic when `total > 50_000` and `process.stderr.isTTY`.
  4. Both call `fillMeta` (re-export from `fts.ts`) and DO NOT call `applyPinOrdering` (existing JS behavior: pin ordering applies only to `ftsSearch`).

  Show the full file body in code; body is mechanical translation of the JS source.

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/core/search/regex.ts
git commit -m "refactor(multivac): port regex post-filter + scan search modes"
```

---

### Task 15: Port search/recent.ts (recent conversations + title synth)

**Files:**
- Create: `packages/multivac/src/core/search/recent.ts`

**Source:** `packages/multivac/src/multivac.js:545-705` (WRAPPER_TAGS, isWrapperContent, synthesizeTitle, normalizeTailContent, recentConversations).

- [ ] **Step 1: Write `recent.ts`** — direct TS port. The only semantic change: `WHERE source = ?` filter is **not** added here; recent browse shows all enabled sources unless filtered (P2 feature). For P1 we keep behavior identical: the SQL is unchanged except `messages` no longer needs to be filtered by source (every row has `source='claude'` after migration).

  Notable details to translate:
  - Saved-name overlay uses `${row.source}:${conversation_id}` as the lookup key into `sessionStore.names`.
  - The SELECT must include `MAX(source) AS source` so the resulting `ResultRow` carries source.
  - `applyPinOrdering` is invoked at the end with the (now `${source}:${id}`) keyed pins.

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/core/search/recent.ts
git commit -m "refactor(multivac): port recent-conversations browse + title synth"
```

---

### Task 16: Port one-shot renderers (text + tsv + preview)

**Files:**
- Create: `packages/multivac/src/core/render/text.ts`
- Create: `packages/multivac/src/core/render/tsv.ts`
- Create: `packages/multivac/src/core/render/preview.ts`

**Source:** `packages/multivac/src/multivac.js:709-791` (renderText, renderTsv, renderPreview).

Two important changes for P1:
1. `renderPreview` becomes **string-producing** instead of writing directly to stdout. The picker's `usePreview` hook needs a string. The CLI wrapper for the `--preview` flag will write the returned string itself.
2. TSV output keeps **7 columns** in P1 (`source` is NOT added to TSV until P2 explicitly decides on the cut). The internal data model has `source` but the renderer omits it.

- [ ] **Step 1: Write `text.ts`** — `renderText(results, useColor): string` — same layout as JS source but returns a string. The CLI calls `process.stdout.write(renderText(...))`.

- [ ] **Step 2: Write `tsv.ts`** — `renderTsv(results): string`. Keep 7 columns: `session_id, project, project_path, date, messages_count, snippet, score`.

- [ ] **Step 3: Write `preview.ts`** — `renderPreview(db, sessionId, source, useColor): string`. New parameter: `source` (filters the SELECT to that source's rows). Returns the full preview text.

- [ ] **Step 4: Add the resume-one-liner helper used by `renderText`**

  Move `shellQuote` and `resumeOneLiner` from `multivac.js:286-298` into `src/sources/claude/resume.ts` (Task 20 fully owns that file). For now create a tiny `src/core/render/resume-line.ts` that takes `source.resume?.resumeOneLiner?(row)` if defined, else falls back to printing `${row.sessionId}` with a one-line notice. Concrete: in P1 the only source is Claude and it has `resume`, so the line will be the same as today.

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/core/render/
git commit -m "refactor(multivac): port one-shot text/TSV/preview renderers as pure functions"
```

---

### Task 17: Port CLI args + help

**Files:**
- Create: `packages/multivac/src/cli/args.ts`
- Create: `packages/multivac/src/cli/validate.ts`
- Create: `packages/multivac/test/unit/args.test.ts`

**Source:** `packages/multivac/src/multivac.js:798-1260` (OPTIONS, HELP_WIDTH, buildHelp, parseArgs, validateArgs, selectMode).

- [ ] **Step 1: Port the OPTIONS table verbatim** (typed). Then `wrapText`, `formatOptionEntry`, `buildHelp` — all unchanged in behavior. Export `OPTIONS: readonly OptionSpec[]` so the drift-guard shell test can keep working.

```typescript
// src/cli/args.ts (head — full OPTIONS table follows verbatim)
export interface OptionSpec {
  flags: string[];
  placeholder?: string;
  group: "Options" | "Filters" | "Output" | "Index management" | "Dangerous";
  description: string;
}

export const OPTIONS: readonly OptionSpec[] = [
  /* … verbatim from multivac.js:798-960 … */
];

export const HELP_WIDTH = 80;
export const HELP_FLAG_COL = 28;
```

- [ ] **Step 2: Port `parseArgs(argv): Args` and `selectMode`** — keep the `case "--…":` idiom that the drift-guard test scans for. Return type `Args` (from `core/types.ts`).

- [ ] **Step 3: Port `validateArgs(args): void`** to `validate.ts`, including `parseSince`.

- [ ] **Step 4: Write `args.test.ts`** for parseArgs + selectMode:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../src/cli/args.js";
import { selectMode } from "../../src/cli/args.js"; // co-located

test("parseArgs: positional becomes query", () => {
  const a = parseArgs(["hello"]);
  assert.equal(a.query, "hello");
});

test("parseArgs: --since parses date", () => {
  const a = parseArgs(["x", "--since", "2026-01-01"]);
  assert.equal(a.since, "2026-01-01");
});

test("parseArgs: equals form --flag=value", () => {
  const a = parseArgs(["x", "--limit=5"]);
  assert.equal(a.limit, 5);
});

test("parseArgs: -- escape preserves init as literal query", () => {
  const a = parseArgs(["--", "init"]);
  assert.equal(a.query, "init");
  assert.equal(a.literalQuery, true);
});

test("selectMode: --list forces one-shot", () => {
  const a = parseArgs(["x", "--list"]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: true });
  assert.equal(m, "one-shot");
});

test("selectMode: TTY + no flags → picker", () => {
  const a = parseArgs([]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: true });
  assert.equal(m, "picker");
});

test("selectMode: piped stdout → one-shot", () => {
  const a = parseArgs(["query"]);
  const m = selectMode(a, { stdinTTY: true, stdoutTTY: false });
  assert.equal(m, "one-shot");
});
```

- [ ] **Step 5: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/cli/args.ts packages/multivac/src/cli/validate.ts packages/multivac/test/unit/args.test.ts
git commit -m "refactor(multivac): port CLI args/validate/selectMode + unit tests"
```

---

## Phase D: Claude source implementation

### Task 18: Port Claude discovery + parse

**Files:**
- Create: `packages/multivac/src/sources/claude/discover.ts`
- Create: `packages/multivac/src/sources/claude/parse.ts`

**Source:** `packages/multivac/src/indexer.js:71-228` (projectsRoot, listJsonlFiles, decodeProjectPathFromCwd, projectNameFromPath, parseTimestampMs, flattenContentString, clipToolUseInput, recordToRows, INDEXABLE_TYPES, TOOL_USE_INPUT_CAP).

- [ ] **Step 1: Write `discover.ts`**

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SourceFile } from "../types.js";

export function projectsRoot(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

export async function discover(): Promise<SourceFile[]> {
  const root = projectsRoot();
  const files: SourceFile[] = [];
  if (!fs.existsSync(root)) return files;
  let projectDirs: fs.Dirent[];
  try { projectDirs = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return files; }
  for (const ent of projectDirs) {
    if (!ent.isDirectory()) continue;
    const projectDir = path.join(root, ent.name);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(projectDir, { withFileTypes: true }); }
    catch { continue; }
    for (const sub of entries) {
      if (sub.isFile() && sub.name.endsWith(".jsonl")) {
        const p = path.join(projectDir, sub.name);
        const stat = fs.statSync(p);
        files.push({ path: p, mtimeMs: Math.floor(stat.mtimeMs) });
      }
    }
  }
  return files;
}

// Re-export listJsonlFiles for the indexer status reporter.
export { discover as listJsonlFiles };
```

- [ ] **Step 2: Write `parse.ts`** — port `recordToRows`, `flattenContentString`, `clipToolUseInput`, `decodeProjectPathFromCwd`, `projectNameFromPath`, `parseTimestampMs`. The `parse(file)` export wraps `readline`-streamed JSONL parsing and yields `Omit<MessageRow, "id" | "source">`. The runner attaches `id` and `source` (Task 21).

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/sources/claude/discover.ts packages/multivac/src/sources/claude/parse.ts
git commit -m "refactor(multivac): port Claude source discovery + JSONL parse"
```

---

### Task 19: Port Claude resume + tmux + install

**Files:**
- Create: `packages/multivac/src/sources/claude/resume.ts`
- Create: `packages/multivac/src/sources/claude/tmux.ts`
- Create: `packages/multivac/src/sources/claude/install.ts`

**Source:**
- `picker.js:115-183` (sanitizeTmuxName, shellSingleQuote, buildTmuxNewWindowCommand, buildClaudeArgs)
- `picker.js:727-795` (spawnClaude, spawnTmuxNewWindow)
- `picker.js:286-312` (shellQuote, resumeOneLiner) — these belong to Claude
- `multivac.js:1303-1395` (runInit, claudeOnPath, detectAlreadyConfigured, runClaudeSubcommand, printManualInstall)

- [ ] **Step 1: Write `resume.ts`** — exports `buildClaudeArgs`, `spawnClaude(row, action, opts): SpawnResult`, `resumeOneLiner`, `shellQuote`, `isExistingDir`.

- [ ] **Step 2: Write `tmux.ts`** — exports `buildTmuxNewWindowCommand`, `sanitizeTmuxName`, `shellSingleQuote`, `spawnTmuxNewWindow(row, opts): SpawnResult`.

- [ ] **Step 3: Write `install.ts`** — exports `runInit(): Promise<InstallResult>`, `claudeOnPath`, `detectAlreadyConfigured`, `INIT_MARKETPLACE`, `INIT_PLUGIN`.

- [ ] **Step 4: Wire all of these into `sources/claude/index.ts`** as the default-exported ChatSource. Replace the Task 8 stub.

```typescript
// src/sources/claude/index.ts — final form
import type { ChatSource } from "../types.js";
import { discover } from "./discover.js";
import { parse } from "./parse.js";
import { spawnClaude } from "./resume.js";
import { spawnTmuxNewWindow } from "./tmux.js";
import { runInit } from "./install.js";

const claudeSource: ChatSource = {
  id: "claude",
  displayName: "Claude Code",
  discover,
  parse,
  resume: {
    actions: ["resume", "fork", "dangerous", "remote-control", "tmux-window"],
    spawn(row, action, opts) {
      if (action === "tmux-window") return spawnTmuxNewWindow(row, opts);
      return spawnClaude(row, action, opts);
    },
  },
  install: {
    run: runInit,
    manualInstructions: () =>
      "To install manually, paste into a Claude Code session:\n" +
      "\n" +
      "/plugin marketplace add krmrn42/krmrn-skills\n" +
      "/plugin install chat-search@krmrn-skills\n",
  },
};
export default claudeSource;
```

- [ ] **Step 5: Add unit test for `buildClaudeArgs` (was unit-tested in JS via MULTIVAC_TEST hatch)**

```typescript
// test/unit/claudeSource.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeArgs } from "../../src/sources/claude/resume.js";
import type { ResultRow } from "../../src/core/types.js";

const row: ResultRow = {
  source: "claude", sessionId: "abc-123", projectPath: "/p",
  projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
};

test("resume action — no name", () => {
  assert.deepEqual(buildClaudeArgs("resume", row, null), ["--resume", "abc-123"]);
});

test("resume action — with name", () => {
  assert.deepEqual(buildClaudeArgs("resume", row, "Foo"), ["--name", "Foo", "--resume", "abc-123"]);
});

test("fork action prepends --fork-session", () => {
  assert.deepEqual(buildClaudeArgs("fork", row, null), ["--fork-session", "--resume", "abc-123"]);
});

test("dangerous action prepends --dangerously-skip-permissions", () => {
  assert.deepEqual(buildClaudeArgs("dangerous", row, null), ["--dangerously-skip-permissions", "--resume", "abc-123"]);
});

test("remote-control: name flows into positional arg (no --name)", () => {
  assert.deepEqual(buildClaudeArgs("remote-control", row, "Foo"), ["--remote-control", "Foo", "--resume", "abc-123"]);
});

test("remote-control: no name → no positional", () => {
  assert.deepEqual(buildClaudeArgs("remote-control", row, null), ["--remote-control", "--resume", "abc-123"]);
});
```

- [ ] **Step 6: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/sources/claude/ packages/multivac/test/unit/claudeSource.test.ts
git commit -m "feat(multivac): implement Claude source (resume + tmux + install)"
```

---

### Task 20: Port indexer runner with ChatSource

**Files:**
- Create: `packages/multivac/src/indexer/runner.ts`
- Create: `packages/multivac/src/indexer/state.ts`
- Create: `packages/multivac/src/indexer/status.ts`

**Source:** `packages/multivac/src/indexer.js` entire file, restructured.

Major changes:
1. `runIndexer(db)` loops over `getRegistry()` and calls each `source.discover()` then `source.parse(file)`.
2. `_indexer_state` gains `source` in its primary key (`PRIMARY KEY (jsonl_path, source)` — actually `jsonl_path` is already unique per source, so the simpler change is just adding the `source` column and including it in writes).
3. `indexFile(db, source, file)` deletes existing rows for that `(source, conversation_id)` pair before re-inserting (composite WHERE).
4. Row IDs become `${source.id}:${sessionId}:${uuid}:${blockIdx}`.

- [ ] **Step 1: Write `state.ts`** — typed wrappers around the `_indexer_state` table reads/writes.

- [ ] **Step 2: Write `status.ts`** — `getIndexStatus(db, dbPath)`, `renderIndexStatus(status)`, `formatBytes`, `formatTime`. Includes source-aware aggregates (counts by source) in P1 since the column now exists.

- [ ] **Step 3: Write `runner.ts`** with the new structure:

```typescript
// src/indexer/runner.ts (sketch)
import type { DatabaseSync } from "node:sqlite";
import type { ChatSource } from "../sources/types.js";
import { getRegistry } from "../sources/registry.js";
import { ensureSchema, runMigrations } from "./state.js";

export async function runIndexer(db: DatabaseSync, opts: { silent?: boolean } = {}) {
  ensureSchema(db);
  runMigrations(db, opts.silent ?? false);
  const counters = emptyCounters();
  for (const source of getRegistry()) {
    await indexSource(db, source, counters, opts);
  }
  return counters;
}

async function indexSource(db: DatabaseSync, source: ChatSource, counters: Counters, opts: { silent?: boolean }) {
  const files = await source.discover();
  // ... compute toIndex via _indexer_state mtime comparison filtered by source ...
  // ... for each file, call source.parse(file) and insert rows with id = `${source.id}:...` ...
}

export async function fullReindex(db: DatabaseSync, opts: { silent?: boolean } = {}) {
  ensureSchema(db);
  db.exec("DELETE FROM _indexer_state; DELETE FROM messages_fts; DELETE FROM messages;");
  return runIndexer(db, opts);
}
```

The full body is a mechanical TS translation of the JS `runIndexer` + `indexFile`, with the source loop wrapped around and IDs prefixed.

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/indexer/
git commit -m "refactor(multivac): port indexer to source-agnostic runner driven by registry"
```

---

### Task 21: Schema migration on first run

**Files:**
- Modify: `packages/multivac/src/indexer/state.ts`
- Create: `packages/multivac/test/unit/schema-migration.test.ts`

- [ ] **Step 1: Add `runMigrations(db, silent)` to `state.ts`**

```typescript
import { DatabaseSync } from "node:sqlite";
import { detectMigrationNeeded } from "../core/schema.js";

export function runMigrations(db: DatabaseSync, silent: boolean): void {
  const needed = detectMigrationNeeded(db);
  if (needed === 0) return;
  if (needed === 2) {
    if (!silent) {
      process.stderr.write(
        "multivac: index schema migration v2 (adding `source` column). " +
          "This triggers a one-time full reindex; subsequent runs are incremental.\n"
      );
    }
    // Drop and recreate via the SCHEMA_SQL DDL, then full reindex is triggered
    // by the runner when it sees an empty _indexer_state.
    db.exec("DROP TABLE IF EXISTS messages_fts;");
    db.exec("DROP TABLE IF EXISTS messages;");
    db.exec("DROP TABLE IF EXISTS _indexer_state;");
    // Schema bootstrap (called next by ensureSchema) recreates with v2 layout.
  }
}
```

- [ ] **Step 2: Write the migration test**

```typescript
// test/unit/schema-migration.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { detectMigrationNeeded } from "../../src/core/schema.js";

test("fresh DB → no migration needed", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(detectMigrationNeeded(db), 0);
});

test("legacy schema (no source column) → migration v2 needed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT
    );
  `);
  assert.equal(detectMigrationNeeded(db), 2);
});

test("current schema (with source) → no migration needed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      message_uuid TEXT NOT NULL,
      parent_uuid TEXT,
      source TEXT NOT NULL DEFAULT 'claude'
    );
  `);
  assert.equal(detectMigrationNeeded(db), 0);
});
```

- [ ] **Step 3: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/indexer/state.ts packages/multivac/test/unit/schema-migration.test.ts
git commit -m "feat(multivac): detect and apply v2 schema migration (source column)"
```

---

## Phase E: Ink picker

### Task 22: Ink state store + keybindings table

**Files:**
- Create: `packages/multivac/src/tui/state/store.ts`
- Create: `packages/multivac/src/tui/state/actions.ts`
- Create: `packages/multivac/src/tui/state/keybindings.ts`
- Create: `packages/multivac/src/tui/lib/width.ts`

- [ ] **Step 1: Write `lib/width.ts`** — port `visibleLen`, `truncateToWidth`, `wrapToWidth` from `picker.js:40-108`. Ink handles most of this internally, but the snippet truncation logic still needs ANSI-aware width math.

- [ ] **Step 2: Write `state/actions.ts`**

```typescript
import type { ResultRow } from "../../core/types.js";

export type PickerMode = "browse" | "rename" | "help";

export type Action =
  | { type: "set-query"; query: string }
  | { type: "set-results"; results: ResultRow[]; error?: string }
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
```

- [ ] **Step 3: Write `state/store.ts`**

```typescript
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
```

- [ ] **Step 4: Write `state/keybindings.ts`** — port the BINDINGS table from `picker.js:202-287`, typed. Add a `visible(deps, selectedRow?)` that consults `selectedRow?.source`'s ChatSource resume capabilities.

```typescript
import type { ChatSource } from "../../sources/types.js";
import type { ResultRow } from "../../core/types.js";

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

// Helper: does the selected row's source declare a resume action?
function hasResumeAction(deps: KeybindingDeps, row: ResultRow | undefined, action: string): boolean {
  if (!row) return false;
  const src = deps.getSource(row.source);
  return !!src?.resume?.actions.includes(action as any);
}

export const BINDINGS: readonly Binding[] = [
  { keys: ["Enter"], label: "resume", category: "resume",
    visible: (d, r) => hasResumeAction(d, r, "resume"),
    longHelp: "Resume the selected conversation in its source's CLI." },
  { keys: ["Alt-Enter", "Shift-Enter"], label: "dangerous", category: "dangerous",
    visible: (d, r) => !!d.dangerouslySkipPermissions && hasResumeAction(d, r, "dangerous"),
    longHelp: "Spawn the resume action with all permission prompts skipped." },
  { keys: ["Ctrl-T"], label: "remote-control", category: "action",
    visible: (d, r) => hasResumeAction(d, r, "remote-control"),
    longHelp: "Launch the source's remote-control mode for the selected row." },
  { keys: ["Ctrl-W"], label: "tmux-window", category: "action",
    visible: (d, r) => !!d.tmuxAvailable && hasResumeAction(d, r, "tmux-window"),
    longHelp: "Open the resumed session in a new tmux window." },
  { keys: ["Ctrl-R"], label: "rename", category: "action",
    visible: () => true,
    longHelp: "Rename the selected conversation." },
  { keys: ["Ctrl-P"], label: "pin", category: "action",
    visible: () => true,
    longHelp: "Pin/unpin the selected conversation." },
  { keys: ["Ctrl-F"], label: "fork", category: "action",
    visible: (d, r) => hasResumeAction(d, r, "fork"),
    longHelp: "Fork the conversation into a new session." },
  { keys: ["Ctrl-O"], label: "print id", category: "action",
    visible: () => true,
    longHelp: "Print the row's session id to stdout and exit." },
  { keys: ["Ctrl-D"], label: "print path", category: "action",
    visible: () => true,
    longHelp: "Print the row's project path to stdout and exit." },
  { keys: ["Up/Down"], label: "nav", category: "navigation", visible: () => true,
    longHelp: "Move cursor up/down (also Ctrl-K / Ctrl-J)." },
  { keys: ["?"], label: "help", category: "navigation", visible: () => true,
    longHelp: "Toggle the binding reference overlay." },
  { keys: ["Esc"], label: "cancel", category: "navigation", visible: () => true,
    longHelp: "Cancel the picker (exit 0)." },
];

// buildStatusBar returns 1 or 2 lines of formatted bindings.
export function buildStatusBar(
  deps: KeybindingDeps,
  selectedRow: ResultRow | undefined,
  cols: number,
): string[] {
  // ... port from picker.js:329-338, using the visibility predicate ...
  return []; // placeholder — full body in implementation
}
```

The full `buildStatusBar` body mirrors the JS version (single-line vs two-line based on width); types make it explicit.

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/tui/
git commit -m "feat(multivac): picker state reducer + keybinding capability matrix"
```

---

### Task 23: PromptLine + StatusBar Ink components

**Files:**
- Create: `packages/multivac/src/tui/components/PromptLine.tsx`
- Create: `packages/multivac/src/tui/components/StatusBar.tsx`
- Create: `packages/multivac/test/tui/StatusBar.test.tsx`

- [ ] **Step 1: Write `PromptLine.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { PickerMode } from "../state/actions.js";

interface Props {
  mode: PickerMode;
  query: string;
  renameBuffer: string;
  searchPending: boolean;
}

export function PromptLine({ mode, query, renameBuffer, searchPending }: Props) {
  if (mode === "rename") {
    return (
      <Box>
        <Text color="cyan">rename&gt; </Text>
        <Text>{renameBuffer}</Text>
        <Text inverse> </Text>
      </Box>
    );
  }
  if (mode === "help") {
    return (
      <Box>
        <Text color="cyan">help&gt; </Text>
        <Text dimColor>press any key to dismiss</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="cyan">multivac&gt; </Text>
      <Text>{query}</Text>
      {searchPending ? <Text dimColor> …</Text> : null}
    </Box>
  );
}
```

- [ ] **Step 2: Write `StatusBar.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { buildStatusBar, type KeybindingDeps } from "../state/keybindings.js";
import type { ResultRow } from "../../core/types.js";

interface Props {
  deps: KeybindingDeps;
  selectedRow: ResultRow | undefined;
  cols: number;
}

export function StatusBar({ deps, selectedRow, cols }: Props) {
  const lines = buildStatusBar(deps, selectedRow, cols);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => <Text key={i}>{line}</Text>)}
    </Box>
  );
}
```

- [ ] **Step 3: Write the component test**

```tsx
// test/tui/StatusBar.test.tsx
import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/tui/components/StatusBar.js";
import claudeSource from "../../src/sources/claude/index.js";

const deps = {
  dangerouslySkipPermissions: false,
  tmuxAvailable: false,
  getSource: (id: string) => (id === "claude" ? claudeSource : undefined),
};

test("StatusBar shows resume + nav bindings for Claude row", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={deps} selectedRow={row} cols={120} />);
  const frame = lastFrame() ?? "";
  assert.ok(frame.includes("Enter resume"));
  assert.ok(frame.includes("Ctrl-O print id"));
});

test("StatusBar hides Ctrl-W when tmux unavailable", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: false }} selectedRow={row} cols={120} />);
  assert.ok(!(lastFrame() ?? "").includes("tmux-window"));
});

test("StatusBar shows Ctrl-W when tmux available", () => {
  const row = {
    source: "claude", sessionId: "x", projectPath: "/p",
    projectName: "p", lastActivity: 0, msgCount: 0, snippet: "", score: 0,
  };
  const { lastFrame } = render(<StatusBar deps={{ ...deps, tmuxAvailable: true }} selectedRow={row} cols={120} />);
  assert.ok((lastFrame() ?? "").includes("tmux-window"));
});
```

- [ ] **Step 4: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/tui/components/PromptLine.tsx packages/multivac/src/tui/components/StatusBar.tsx packages/multivac/test/tui/StatusBar.test.tsx
git commit -m "feat(multivac): Ink PromptLine + StatusBar components"
```

---

### Task 24: ResultList Ink component with pin partition

**Files:**
- Create: `packages/multivac/src/tui/components/ResultList.tsx`
- Create: `packages/multivac/test/tui/ResultList.test.tsx`

- [ ] **Step 1: Write `ResultList.tsx`** — renders each row as two lines (header + snippet) with the pin marker, divider between pinned/unpinned, and a "selected" highlight via Ink's `bold` / `▌` prefix.

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { ResultRow } from "../../core/types.js";
import {
  projectDisplay, shortSession, fmtDate, colorizeSnippet,
} from "../../core/format.js";
import { truncateToWidth } from "../lib/width.js";

interface Props {
  results: ResultRow[];
  cursor: number;
  noColor: boolean;
  listWidth: number;
  maxRows: number;
  dimRows: boolean; // true when in rename mode
}

export function ResultList({ results, cursor, noColor, listWidth, maxRows, dimRows }: Props) {
  // ... port firstUnpinnedIdx + scrollOffset logic from picker.js:608-628 ...
  // ... yield <Box>s with conditional <Text bold> / <Text dimColor> ...
  return <Box flexDirection="column">{/* … */}</Box>;
}
```

- [ ] **Step 2: Write the test** asserting that:
  - When there are pinned + unpinned rows, the "── recent ──" divider appears between them.
  - Pin marker is `📌 ` when `noColor=false`, `* ` when `noColor=true`.
  - Selected row has the `▌ ` prefix.

- [ ] **Step 3: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/tui/components/ResultList.tsx packages/multivac/test/tui/ResultList.test.tsx
git commit -m "feat(multivac): Ink ResultList with pin partition + divider"
```

---

### Task 25: PreviewPane, HelpOverlay, RenameModal

**Files:**
- Create: `packages/multivac/src/tui/components/PreviewPane.tsx`
- Create: `packages/multivac/src/tui/components/HelpOverlay.tsx`
- Create: `packages/multivac/src/tui/components/RenameModal.tsx`
- Create: `packages/multivac/test/tui/RenameModal.test.tsx`

- [ ] **Step 1: Write `PreviewPane.tsx`** — receives `previewText: string` prop (already rendered via `core/render/preview.ts`), wraps to `previewWidth` and renders within an Ink `<Box width={previewWidth}>` with a vertical separator `│` column on the left.

- [ ] **Step 2: Write `HelpOverlay.tsx`** — renders the BINDINGS table with category colors and `longHelp` text. Same layout as `picker.js:585-602`.

- [ ] **Step 3: Write `RenameModal.tsx`** — receives `buffer: string` and renders a narrow help line below the prompt. The prompt itself is `PromptLine` in rename mode; this component is the second line (`Enter save   Esc cancel   (empty + Enter clears the saved name)`).

- [ ] **Step 4: Write `RenameModal.test.tsx`** verifying the help line text and the dim styling.

- [ ] **Step 5: Run, commit**

```bash
cd packages/multivac && npm test
git add packages/multivac/src/tui/components/PreviewPane.tsx packages/multivac/src/tui/components/HelpOverlay.tsx packages/multivac/src/tui/components/RenameModal.tsx packages/multivac/test/tui/RenameModal.test.tsx
git commit -m "feat(multivac): Ink PreviewPane + HelpOverlay + RenameModal"
```

---

### Task 26: Hooks (useSearch, usePreview, useResize, useResume)

**Files:**
- Create: `packages/multivac/src/tui/hooks/useSearch.ts`
- Create: `packages/multivac/src/tui/hooks/usePreview.ts`
- Create: `packages/multivac/src/tui/hooks/useResize.ts`
- Create: `packages/multivac/src/tui/hooks/useResume.ts`

- [ ] **Step 1: Write `useSearch.ts`** — debounced (80ms) effect that calls `ftsSearch` or `recentConversations` depending on whether the query is empty. Caches the recent-browse result for the picker session.

```typescript
import { useEffect, useRef } from "react";
import type { DatabaseSync } from "node:sqlite";
import { ftsSearch } from "../../core/search/fts.js";
import { recentConversations } from "../../core/search/recent.js";
import type { Args, ResultRow, SessionStore } from "../../core/types.js";

export function useSearch(
  db: DatabaseSync,
  args: Args,
  query: string,
  sessionStore: SessionStore,
  onResults: (rows: ResultRow[], error?: string) => void,
  onPending: (pending: boolean) => void,
) {
  const recentCache = useRef<ResultRow[] | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    onPending(true);
    timer.current = setTimeout(() => {
      onPending(false);
      try {
        if (!query.trim()) {
          if (recentCache.current === null) {
            recentCache.current = recentConversations(db, {
              limit: args.limit, projectFilter: args.project, sessionStore,
            });
          }
          onResults(recentCache.current);
          return;
        }
        const rows = ftsSearch(db, { ...args, query, sessionStore });
        onResults(rows);
      } catch (e: any) {
        onResults([], e.message || String(e));
      }
    }, 80);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);
}
```

- [ ] **Step 2: Write `usePreview.ts`** — memoized per-row preview cache, invalidated on dims change.

- [ ] **Step 3: Write `useResize.ts`** — listens on `process.stdout` for `resize` events and dispatches `set-dims`.

- [ ] **Step 4: Write `useResume.ts`** — exposes `runAction(action: ResumeAction, row: ResultRow)`. Looks up the row's source, calls `source.resume?.spawn(...)`, then calls Ink's `useApp().exit()` with the resulting code.

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/tui/hooks/
git commit -m "feat(multivac): picker hooks (search, preview, resize, resume)"
```

---

### Task 27: App.tsx top-level component

**Files:**
- Create: `packages/multivac/src/tui/App.tsx`

**Source:** `packages/multivac/src/picker.js:912-1062` (onKeypress + render orchestration).

- [ ] **Step 1: Write `App.tsx`**

```tsx
import React, { useReducer } from "react";
import { Box, useInput, useApp, useStdout } from "ink";
import type { DatabaseSync } from "node:sqlite";
import type { Args, SessionStore } from "../core/types.js";
import { reducer, initialState } from "./state/store.js";
import { PromptLine } from "./components/PromptLine.js";
import { StatusBar } from "./components/StatusBar.js";
import { ResultList } from "./components/ResultList.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { RenameModal } from "./components/RenameModal.js";
import { useSearch } from "./hooks/useSearch.js";
import { useResume } from "./hooks/useResume.js";
import { useResize } from "./hooks/useResize.js";
import { getSource } from "../sources/registry.js";

interface AppProps {
  db: DatabaseSync;
  args: Args;
  sessionStore: SessionStore;
  saveSessionStore: (s: SessionStore) => void;
  dangerouslySkipPermissions: boolean;
  tmuxAvailable: boolean;
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, { ...initialState, query: props.args.query });
  // ... wire useSearch, useResize, useResume ...
  // ... useInput((input, key) => { /* port onKeypress from picker.js */ }) ...
  // ... render Box layout: PromptLine, StatusBar/RenameModal, body (ResultList | HelpOverlay) + PreviewPane ...
  return <Box flexDirection="column">{/* … */}</Box>;
}
```

The full body is the most complex single file in this plan. The keystroke handler needs to:
- In `mode === "help"`: any key → `exit-help`; Ctrl-C → exit.
- In `mode === "rename"`: Enter → commit, Esc → cancel, Ctrl-U → clear, Backspace → pop, printable → append.
- In `mode === "browse"`: full set of bindings from `picker.js:962-1045`.

Each branch calls either `dispatch(...)` or `runAction(...)` from `useResume`.

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/multivac && npm run typecheck
git add packages/multivac/src/tui/App.tsx
git commit -m "feat(multivac): top-level Ink App with keystroke router"
```

---

## Phase F: Wire main entrypoint and switch over

### Task 28: Replace placeholder `main.ts` with real CLI orchestration

**Files:**
- Modify: `packages/multivac/src/cli/main.ts`

**Source:** `packages/multivac/src/multivac.js:1397-1561` (`main(argv)` function and module-bottom error wrapper).

- [ ] **Step 1: Write the new `main.ts`**

```typescript
import { render } from "ink";
import React from "react";
import { parseArgs } from "./args.js";
import { validateArgs } from "./validate.js";
import { EXIT_OK, EXIT_USER, EXIT_ENV, EXIT_INTERNAL, dieUser, dieEnv } from "./exit-codes.js";
import { buildHelp } from "./args.js";
import { defaultIndexPath, openDb, probeSchema, detectTimestampScale, isPluginOwnedDb } from "../core/db.js";
import { ensureSchema, runMigrations } from "../indexer/state.js";
import { runIndexer, fullReindex } from "../indexer/runner.js";
import { getIndexStatus, renderIndexStatus } from "../indexer/status.js";
import { loadSessionStore, saveSessionStore, sessionsConfigPath } from "../core/sessions.js";
import { ftsSearch } from "../core/search/fts.js";
import { regexPostfilter, regexScan } from "../core/search/regex.js";
import { recentConversations } from "../core/search/recent.js";
import { renderText } from "../core/render/text.js";
import { renderTsv } from "../core/render/tsv.js";
import { renderPreview } from "../core/render/preview.js";
import { getSource } from "../sources/registry.js";
import { App } from "../tui/App.js";
import * as fs from "node:fs";

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  validateArgs(args);

  // Reserved subcommands: `multivac init` and `multivac init <source>` route
  // through the source's install hook (Claude is the default).
  if (!args.literalQuery && args.query === "init") {
    const claude = getSource("claude");
    if (!claude?.install) return EXIT_INTERNAL;
    const result = await claude.install.run();
    process.stdout.write(result.message + "\n");
    return result.ok ? EXIT_OK : EXIT_ENV;
  }

  if (args.printNames) {
    const p = sessionsConfigPath();
    let body: string;
    try { body = fs.readFileSync(p, "utf8"); }
    catch (e: any) {
      if (e?.code === "ENOENT") { process.stdout.write("{}\n"); return EXIT_OK; }
      throw e;
    }
    if (!body.endsWith("\n")) body += "\n";
    process.stdout.write(body);
    return EXIT_OK;
  }

  if (args.unpinAll) {
    const store = loadSessionStore();
    const oldLen = store.pins.length;
    store.pins = [];
    saveSessionStore(store);
    process.stdout.write(`multivac: cleared ${oldLen} pin${oldLen === 1 ? "" : "s"}\n`);
    return EXIT_OK;
  }

  const usingPluginOwned = isPluginOwnedDb(args.dbPath);
  const db = openDb(args.dbPath, { readWrite: usingPluginOwned });

  if (usingPluginOwned) {
    runMigrations(db, false);
    ensureSchema(db);
  }
  probeSchema(db);

  if (args.indexStatus) {
    const status = getIndexStatus(db, args.dbPath);
    process.stdout.write(renderIndexStatus(status));
    return EXIT_OK;
  }

  if (usingPluginOwned) {
    if (args.reindex) await fullReindex(db);
    else await runIndexer(db);
    // Empty-index nudge preserved from JS:1469-1490.
  } else if (args.reindex || args.indexStatus) {
    dieUser("--reindex and --index-status apply only to the plugin-owned index.");
  }

  args.sinceTs *= detectTimestampScale(db);
  const useColor = process.stdout.isTTY && !args.noColor;

  if (args.preview) {
    // preview takes source as a parameter; for P1, scan messages and infer source
    // from the conversation_id.
    const row = db.prepare(
      "SELECT source FROM messages WHERE conversation_id = ? LIMIT 1"
    ).get(args.preview) as { source: string } | undefined;
    const src = row?.source ?? "claude";
    process.stdout.write(renderPreview(db, args.preview, src, useColor));
    return EXIT_OK;
  }

  // Mode selection
  const mode = selectMode(args, { stdinTTY: !!process.stdin.isTTY, stdoutTTY: !!process.stdout.isTTY });

  if (mode === "picker") {
    const sessionStore = loadSessionStore();
    const tmuxAvailable = !!process.env.TMUX && !args.noTmux;
    const { waitUntilExit } = render(
      React.createElement(App, {
        db, args, sessionStore, saveSessionStore,
        dangerouslySkipPermissions: args.dangerouslySkipPermissions,
        tmuxAvailable,
      })
    );
    await waitUntilExit();
    return EXIT_OK;
  }

  // One-shot
  if (args.format === null) args.format = process.stdout.isTTY ? "text" : "tsv";
  let results;
  if (args.scan) results = regexScan(db, args, args.regexCompiled!);
  else if (args.regex) results = regexPostfilter(db, args, args.regexCompiled!);
  else if (!args.query) {
    dieUser(
      "no query provided.\n" +
        'Try: multivac "some keyword"   (on a TTY, bare `multivac` opens the picker)\n' +
        "Run `multivac --help` for the full flag reference."
    );
  } else {
    results = ftsSearch(db, args);
  }
  if (args.format === "tsv") process.stdout.write(renderTsv(results));
  else process.stdout.write(renderText(results, useColor));

  return EXIT_OK;
}

// Help / version short-circuit handled inside parseArgs (it exits directly).
main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    if (e?.code === "SQLITE_READONLY") {
      process.stderr.write(`multivac: ${e.message}\n`);
      process.exit(EXIT_INTERNAL);
    }
    process.stderr.write(`multivac: internal error: ${e?.stack ?? e}\n`);
    process.exit(EXIT_INTERNAL);
  });

import { selectMode } from "./args.js"; // hoisted import; placement is a build-time detail
```

- [ ] **Step 2: Build the bundle**

```bash
cd packages/multivac && npm run build
```

Expected: `dist/multivac.js` rebuilt with the full CLI; size grows from ~10KB (placeholder) to ~250-400KB.

- [ ] **Step 3: Smoke-test against `--help`**

```bash
./dist/multivac.js --help > /tmp/multivac-help-new.txt
diff /tmp/multivac-help-baseline.txt /tmp/multivac-help-new.txt
```

Expected: no diff. If there is a diff, fix `args.ts` until it disappears.

- [ ] **Step 4: Smoke-test against `--version`**

```bash
./dist/multivac.js --version
```

Expected: `0.6.0` (P1 doesn't bump until Task 32).

- [ ] **Step 5: Commit**

```bash
git add packages/multivac/src/cli/main.ts
git commit -m "feat(multivac): wire new main.ts orchestrating ChatSource + Ink picker"
```

---

### Task 29: Switch `bin` to dist, run existing test/multivac.test.sh against new bundle

**Files:**
- Modify: `packages/multivac/package.json`

- [ ] **Step 1: Update `bin` field**

```json
"bin": {
  "multivac": "dist/multivac.js"
},
"files": [
  "dist/",
  "README.md",
  "LICENSE"
]
```

(Remove `"src/"` from `files`.)

- [ ] **Step 2: Update `test/multivac.test.sh`** — its current entry is `node src/multivac.js`. Change to `node dist/multivac.js`. Verify with the build present:

```bash
cd packages/multivac
npm run build
bash test/multivac.test.sh
```

Expected: all tests still pass. **If anything fails, this is a regression — track it down before continuing.**

- [ ] **Step 3: Commit**

```bash
git add packages/multivac/package.json packages/multivac/test/multivac.test.sh
git commit -m "chore(multivac): point bin and tests at dist/ bundle"
```

---

### Task 30: Delete legacy JS files

**Files:**
- Delete: `packages/multivac/src/multivac.js`
- Delete: `packages/multivac/src/indexer.js`
- Delete: `packages/multivac/src/picker.js`

- [ ] **Step 1: Verify the new code is the live path**

```bash
cd packages/multivac && bash test/multivac.test.sh && npm test && npm run typecheck
```

All three must pass.

- [ ] **Step 2: Remove the legacy JS**

```bash
git rm packages/multivac/src/multivac.js packages/multivac/src/indexer.js packages/multivac/src/picker.js
```

- [ ] **Step 3: Rebuild + re-run tests**

```bash
cd packages/multivac && npm run build && npm run test:all
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(multivac): remove legacy JS sources (now in dist/ bundle)"
```

---

## Phase G: Plugin embedding and dist commit

### Task 31: Repoint plugin symlinks

**Files:**
- Modify: `plugins/chat-search/bin/multivac` (symlink)
- Delete: `plugins/chat-search/bin/indexer.js` (symlink)
- Delete: `plugins/chat-search/bin/picker.js` (symlink)

- [ ] **Step 1: Repoint multivac symlink**

```bash
cd plugins/chat-search/bin
rm multivac indexer.js picker.js
ln -s ../../../packages/multivac/dist/multivac.js multivac
```

- [ ] **Step 2: Verify symlink target exists**

```bash
ls -la plugins/chat-search/bin/multivac
readlink plugins/chat-search/bin/multivac
test -f plugins/chat-search/bin/multivac && echo "OK"
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add plugins/chat-search/bin/
git commit -m "chore(chat-search): repoint plugin bin to bundled multivac dist"
```

---

### Task 32: Bump version + remove dist/ from .gitignore + commit dist/

**Files:**
- Modify: `packages/multivac/package.json` (version → 0.7.0)
- Modify: `plugins/chat-search/.claude-plugin/plugin.json` (version → 0.7.0)
- Modify: `.claude-plugin/marketplace.json` (chat-search entry version → 0.7.0)
- Modify: `packages/multivac/.gitignore` (remove dist/)
- Add: `packages/multivac/dist/multivac.js`

- [ ] **Step 1: Bump versions in all three sites**

```bash
# Use a multi-line sed or just edit each file. Targets:
# packages/multivac/package.json:        "version": "0.6.0"  →  "0.7.0"
# plugins/chat-search/.claude-plugin/plugin.json same
# .claude-plugin/marketplace.json — chat-search entry's version field
```

- [ ] **Step 2: Update package.json — remove `MULTIVAC_VERSION` define, the bundle reads pkg via the same define at next build**

The current `esbuild.config.mjs` already reads `pkg.version` at build time; no change needed there.

- [ ] **Step 3: Edit `.gitignore` to remove `dist/`**

```bash
cd packages/multivac
sed -i '/^dist\/$/d' .gitignore
# Verify:
cat .gitignore
```

- [ ] **Step 4: Rebuild with new version**

```bash
cd packages/multivac && npm run build
./dist/multivac.js --version
```

Expected: prints `0.7.0`.

- [ ] **Step 5: Add and commit dist + version bumps**

```bash
git add packages/multivac/.gitignore packages/multivac/dist/multivac.js packages/multivac/package.json plugins/chat-search/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "release(multivac): bump to v0.7.0 and commit dist/ build artifact"
```

---

### Task 33: Pre-commit hook for dist drift

**Files:**
- Modify: `.pre-commit-config.yaml` (repo root)

- [ ] **Step 1: Add a local hook**

```yaml
# .pre-commit-config.yaml — append to existing hooks
  - repo: local
    hooks:
      - id: multivac-build-clean
        name: Verify packages/multivac/dist/ matches src/
        language: system
        entry: bash -c 'cd packages/multivac && npm run build && git diff --exit-code dist/'
        files: '^packages/multivac/(src/|esbuild\.config\.mjs|package\.json)'
        pass_filenames: false
```

- [ ] **Step 2: Test the hook**

```bash
pre-commit run multivac-build-clean --files packages/multivac/src/cli/main.ts
```

Expected: hook runs, build is clean, diff exits 0.

- [ ] **Step 3: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "chore(ci): add pre-commit hook verifying multivac dist/ ≡ src/"
```

---

## Phase H: Docs and final verification

### Task 34: Update README

**Files:**
- Modify: `packages/multivac/README.md`

- [ ] **Step 1: Update install instructions** to note the bundle:

  - Remove the "Zero-dependency" claim from the opening paragraph (replace with "bundled-dependencies Node CLI — single file at install time").
  - Update the `keywords` array in `package.json` to drop `"zero-deps"`.

- [ ] **Step 2: Verify**

```bash
grep -i "zero-dep" packages/multivac/README.md packages/multivac/package.json
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add packages/multivac/README.md packages/multivac/package.json
git commit -m "docs(multivac): drop zero-deps claim now that Ink/React are bundled"
```

---

### Task 35: End-to-end smoke test

**Files:**
- None modified — verification only.

- [ ] **Step 1: Full test:all run**

```bash
cd packages/multivac && npm run test:all
```

Expected: typecheck + unit tests + build + shell tests all pass.

- [ ] **Step 2: Manual smoke checks against a real Claude Code projects directory**

```bash
# Basic FTS query
./dist/multivac.js "deploy" --list --limit 3

# Interactive picker (requires TTY — run manually)
./dist/multivac.js -i

# Verify reindex + status
./dist/multivac.js --reindex
./dist/multivac.js --index-status

# Print names (read-only)
./dist/multivac.js --print-names | head
```

For each: verify the output matches expectations against the v0.6.0 baseline behavior. The picker's keybindings should be identical; the only externally-visible change is the one-time migration notice on the first `--reindex` after upgrade.

- [ ] **Step 3: Confirm no untracked files**

```bash
cd /home/data/repos/github.com/krmrn42/krmrn-skills
git status
```

Expected: clean working tree (other than possibly local notes).

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feat/multivac-p1-refactor
gh pr create --title "feat(multivac): TS/Ink/multi-source P1 refactor (v0.7.0)" --body "$(cat <<'EOF'
## Summary
- Convert `@krmrn42/multivac` to TypeScript, bundled via esbuild to a single committed `dist/multivac.js`.
- Replace hand-rolled raw-mode picker with Ink + React components driven by `useReducer`.
- Introduce `ChatSource` interface as the per-tool seam; Claude is the only impl in P1.
- Migrate index schema to add `source` column; `sessions.json` keys migrate to `${source}:${id}`.
- All current CLI flags, exit codes, and picker keybindings preserved bit-for-bit.

See [`docs/superpowers/specs/2026-05-22-multivac-architecture-refactor-design.md`](docs/superpowers/specs/2026-05-22-multivac-architecture-refactor-design.md) for full design rationale.

## Test plan
- [x] `npm run test:all` green (typecheck + unit + build + shell)
- [x] `--help` output byte-identical to v0.6.0 baseline
- [x] `--version` reports 0.7.0
- [x] Manual picker smoke test against real `~/.claude/projects/`
- [x] First-run migration writes one-line stderr notice and reindexes cleanly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Done.

---

## Self-Review Notes

This plan was self-reviewed against the spec at `docs/superpowers/specs/2026-05-22-multivac-architecture-refactor-design.md`:

- **Spec D1 (TS + esbuild bundle):** Tasks 2-6 set up the toolchain; Task 32 commits the artifact.
- **Spec D2 (Ink):** Tasks 22-27 implement the picker as Ink components.
- **Spec D3 (ChatSource interface):** Tasks 7-8 define types and registry; Tasks 18-19 implement the Claude impl.
- **Spec D4 (single DB + source column):** Tasks 10 (schema), 20 (indexer), 21 (migration) carry this.
- **Spec D5 (source-keyed sessions.json):** Task 12 implements + tests migration.
- **Spec D6 (P1 = pure refactor):** Task 35's smoke test gates this. The plan never adds new user-visible flags in P1.
- **Spec D7 (committed dist/ + symlink):** Tasks 31, 32, 33 cover this. Pre-commit hook in Task 33.

**Tasks where the engineer must read existing JS for body details rather than have full code in the plan:** Tasks 14, 15, 22 (`buildStatusBar` body), 24 (`ResultList` body), 27 (`App.tsx` keystroke router), 28 (`main.ts` empty-index nudge), 20 (`indexFile` body). For each, the plan provides the function signature, the type contract, and the line-range citation into the JS source. This is faithful to the "no placeholders" rule — the body is fully specified by reference to existing, tested code that's being relocated.

**Type consistency check (post-write):**
- `MessageRow` shape is consistent between `core/types.ts` (Task 7), `sources/types.ts` (Task 7), `indexer/runner.ts` (Task 20), and `core/search/fts.ts` (Task 13).
- `ResultRow.source` is required everywhere it appears.
- `ChatSource.parse` returns `AsyncIterable<Omit<MessageRow, "id" | "source">>` — the runner attaches both fields when inserting (Task 20).
- `applyPinOrdering` pin keys are `${source}:${sessionId}` (Task 11) consistent with `sessions.ts` migration (Task 12).

No placeholders or `TBD` markers; every step contains either complete code, an exact command with expected output, or a citation to the JS source line range being relocated with a type signature for the destination.
