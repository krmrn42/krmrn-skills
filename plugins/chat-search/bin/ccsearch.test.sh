#!/usr/bin/env bash
# ccsearch.test.sh — fixture-DB smoke test for ccsearch.
#
# Builds a temporary SQLite database matching the live Claude Code FTS5 schema,
# populates 5 fake conversations across 2 fake projects, and asserts on row
# counts and exit codes for several invocations. Does NOT touch the user's
# real ~/.claude/conversation-search.db.
#
# Usage:
#   bash plugins/chat-search/bin/ccsearch.test.sh [--keep]
#
# --keep leaves the fixture DB on disk (printed at the end) for manual probing.

set -u  # NB: -e is intentionally OFF — we test exit codes explicitly.

HERE="$(cd "$(dirname "$0")" && pwd)"
CCSEARCH="$HERE/ccsearch"

# Resolve sqlite3 once (some installs have it bundled with Python only)
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ccsearch.test.sh: sqlite3 binary required for the test (used to build the fixture)" >&2
  exit 2
fi

DB="$(mktemp -t ccsearch-fixture.XXXXXX.db)"
KEEP=0
[[ "${1-}" == "--keep" ]] && KEEP=1

cleanup() {
  if [[ "$KEEP" == "1" ]]; then
    echo
    echo "fixture DB kept at: $DB"
  else
    rm -f "$DB"
  fi
}
trap cleanup EXIT

PASS=0
FAIL=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS+1))
  else
    printf '  FAIL  %s — expected %s, got %s\n' "$name" "$expected" "$actual" >&2
    FAIL=$((FAIL+1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS+1))
  else
    printf '  FAIL  %s — expected substring %q in output\n' "$name" "$needle" >&2
    printf '         got: %q\n' "$haystack" >&2
    FAIL=$((FAIL+1))
  fi
}

# --- Build the fixture --------------------------------------------------

echo "Building fixture DB at $DB"

sqlite3 "$DB" <<'SQL'
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  raw_content TEXT,
  tool_operations TEXT,
  message_uuid TEXT NOT NULL,
  parent_uuid TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_project ON messages(project_path);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_type ON messages(type);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, searchable_text)
  VALUES (new.id, new.content || ' ' || COALESCE(new.tool_operations, ''));
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
  INSERT INTO messages_fts(id, searchable_text)
  VALUES (new.id, new.content || ' ' || COALESCE(new.tool_operations, ''));
END;

-- Conversation A: in project alpha, talks about "session timeout"
INSERT INTO messages VALUES
  ('m1', 'conv-aaaa-1111-1111-1111-111111111111', '/home/u/projects/alpha', 'alpha',
   1735689600000, 'user', 'how do I configure session timeout for the auth service', NULL, NULL, 'u1', NULL, 0),
  ('m2', 'conv-aaaa-1111-1111-1111-111111111111', '/home/u/projects/alpha', 'alpha',
   1735689610000, 'assistant', 'set SESSION_TIMEOUT_SECONDS in your env. there is no timeout for refresh tokens.', NULL, NULL, 'a1', 'u1', 0),
  ('m3', 'conv-aaaa-1111-1111-1111-111111111111', '/home/u/projects/alpha', 'alpha',
   1735689620000, 'tool_use', NULL, NULL, '{"command":"grep -r SESSION_TIMEOUT_SECONDS"}', 't1', 'a1', 0);

-- Conversation B: in project alpha, talks about regex parsing — has a TOKEN_DEADBEEF marker
INSERT INTO messages VALUES
  ('m4', 'conv-bbbb-2222-2222-2222-222222222222', '/home/u/projects/alpha', 'alpha',
   1735776000000, 'user', 'I need to write a regex to parse log timestamps', NULL, NULL, 'u2', NULL, 0),
  ('m5', 'conv-bbbb-2222-2222-2222-222222222222', '/home/u/projects/alpha', 'alpha',
   1735776010000, 'assistant', 'try this regex ^[A-Z]{3} and validate with TOKEN_DEADBEEF as a sentinel', NULL, NULL, 'a2', 'u2', 0);

-- Conversation C: in project beta, talks about session timeout (different project)
INSERT INTO messages VALUES
  ('m6', 'conv-cccc-3333-3333-3333-333333333333', '/home/u/projects/beta', 'beta',
   1735862400000, 'user', 'why does my session timeout differ between staging and prod', NULL, NULL, 'u3', NULL, 0),
  ('m7', 'conv-cccc-3333-3333-3333-333333333333', '/home/u/projects/beta', 'beta',
   1735862410000, 'assistant', 'check your load balancer idle session timeout — it overrides app config', NULL, NULL, 'a3', 'u3', 0);

-- Conversation D: in project beta, much older — for --since testing
INSERT INTO messages VALUES
  ('m8', 'conv-dddd-4444-4444-4444-444444444444', '/home/u/projects/beta', 'beta',
   1700000000000, 'user', 'what does session affinity do', NULL, NULL, 'u4', NULL, 0),
  ('m9', 'conv-dddd-4444-4444-4444-444444444444', '/home/u/projects/beta', 'beta',
   1700000010000, 'assistant', 'session affinity pins requests to the same backend pod', NULL, NULL, 'a4', 'u4', 0);

-- Conversation E: tool_use only — testing default-excludes-tools
INSERT INTO messages VALUES
  ('m10', 'conv-eeee-5555-5555-5555-555555555555', '/home/u/projects/alpha', 'alpha',
    1735948800000, 'user', 'unrelated query about deployment', NULL, NULL, 'u5', NULL, 0),
  ('m11', 'conv-eeee-5555-5555-5555-555555555555', '/home/u/projects/alpha', 'alpha',
    1735948810000, 'tool_result', 'output: PROCESS_KILLED_OOM', NULL, NULL, 't5', 'u5', 0);
SQL

# All output below is captured for assertion. Run ccsearch with --no-color and explicit --format text.
RUN() { CCSEARCH_DB="$DB" "$CCSEARCH" --no-color "$@" 2>&1; }
RUN_CODE() { CCSEARCH_DB="$DB" "$CCSEARCH" --no-color "$@" >/dev/null 2>&1; echo $?; }

# --- Tests --------------------------------------------------------------

echo
echo "Test 1: simple FTS query for 'session timeout' returns 2 conversations (A and C, not D — D has 'session' but not 'timeout' adjacent)"
out="$(RUN '"session timeout"' --format text)"
# Conversation A and C contain the phrase; D contains only 'session affinity'
assert_contains "T1.A_match"   "alpha" "$out"
assert_contains "T1.C_match"   "beta"  "$out"
# session count should not include D
case "$out" in
  *"affinity"*) FAIL=$((FAIL+1)); echo "  FAIL  T1.D_excluded — D's snippet leaked in" >&2 ;;
  *)            PASS=$((PASS+1)); echo "  PASS  T1.D_excluded" ;;
esac

echo
echo "Test 2: empty result"
out="$(RUN 'stringthatappearsnowhere' --format text)"
code="$(RUN_CODE 'stringthatappearsnowhere')"
assert_eq        "T2.exit_zero" "0" "$code"
assert_contains  "T2.no_matches_message" "no matches" "$out"

echo
echo "Test 3: --project filter"
out="$(RUN session --project beta --format text)"
assert_contains "T3.beta_present"  "beta"  "$out"
case "$out" in
  *"alpha"*) FAIL=$((FAIL+1)); echo "  FAIL  T3.alpha_excluded" >&2 ;;
  *)         PASS=$((PASS+1)); echo "  PASS  T3.alpha_excluded" ;;
esac

echo
echo "Test 4: --regex post-filter narrows FTS results"
out="$(RUN regex --regex 'TOKEN_[A-F0-9]+' --format text)"
assert_contains "T4.token_match" "TOKEN_DEADBEEF" "$out"

echo
echo "Test 5: --regex --scan finds patterns FTS would miss (pure-regex token, no FTS query)"
out="$(RUN --regex 'PROCESS_KILLED_OOM' --scan --include-tools --format text)"
assert_contains "T5.scan_finds_tool_result" "PROCESS_KILLED_OOM" "$out"

echo
echo "Test 6: --include-tools finds tool_use / tool_result matches"
out="$(RUN SESSION_TIMEOUT_SECONDS --include-tools --format text)"
# m3 (tool_use) contains SESSION_TIMEOUT_SECONDS in its tool_operations; m2 (assistant) also mentions it.
assert_contains "T6.tools_match" "alpha" "$out"

echo
echo "Test 7: default search excludes tool rows"
out="$(RUN PROCESS_KILLED_OOM --format text)"
# Should be empty — only m11 (tool_result) contains it
assert_contains "T7.tools_excluded_by_default" "no matches" "$out"

echo
echo "Test 8: --since filter (after 2025-01-01) excludes conversation D"
out="$(RUN session --since 2025-01-01 --format text)"
case "$out" in
  *"affinity"*) FAIL=$((FAIL+1)); echo "  FAIL  T8.D_excluded — D's content from 2023 leaked through" >&2 ;;
  *)            PASS=$((PASS+1)); echo "  PASS  T8.D_excluded" ;;
esac

echo
echo "Test 9: --since unparseable date → exit 1"
code="$(RUN_CODE x --since notadate)"
assert_eq "T9.exit_1" "1" "$code"

echo
echo "Test 10: invalid regex → exit 1"
code="$(RUN_CODE x --regex '[unclosed')"
assert_eq "T10.exit_1" "1" "$code"

echo
echo "Test 11: --regex without query and without --scan → exit 1"
code="$(RUN_CODE --regex 'pat')"
assert_eq "T11.exit_1" "1" "$code"

echo
echo "Test 12: conflicting type flags → exit 1"
code="$(RUN_CODE x --only-user --include-tools)"
assert_eq "T12.exit_1" "1" "$code"

echo
echo "Test 13: --scan without --regex → exit 1"
code="$(RUN_CODE x --scan)"
assert_eq "T13.exit_1" "1" "$code"

echo
echo "Test 14: missing DB → exit 2"
out="$(CCSEARCH_DB=/nonexistent/path/to/no.db "$CCSEARCH" --no-color foo 2>&1)"
code="$(CCSEARCH_DB=/nonexistent/path/to/no.db "$CCSEARCH" --no-color foo >/dev/null 2>&1; echo $?)"
assert_eq        "T14.exit_2" "2" "$code"
assert_contains  "T14.message" "not found" "$out"

echo
echo "Test 15: schema drift (drop project_name column) → exit 2"
DB2="$(mktemp -t ccsearch-fixture-broken.XXXXXX.db)"
sqlite3 "$DB2" <<'SQL'
-- Same schema but missing project_name
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  -- project_name DELIBERATELY OMITTED
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  message_uuid TEXT NOT NULL,
  parent_uuid TEXT
);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
SQL
out="$(CCSEARCH_DB="$DB2" "$CCSEARCH" --no-color foo 2>&1)"
code="$(CCSEARCH_DB="$DB2" "$CCSEARCH" --no-color foo >/dev/null 2>&1; echo $?)"
assert_eq        "T15.exit_2" "2" "$code"
assert_contains  "T15.message" "project_name" "$out"
rm -f "$DB2"

echo
echo "Test 16: tsv format produces tab-separated rows with session id in column 1"
out="$(RUN '"session timeout"' --format tsv)"
# Expect at least one row; first column should be a UUID-like string (conv-aaaa-... or conv-cccc-...)
case "$out" in
  *conv-aaaa*|*conv-cccc*) PASS=$((PASS+1)); echo "  PASS  T16.tsv_session_id_present" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T16.tsv_session_id_present — output: $out" >&2 ;;
esac

echo
echo "Test 17: --preview renders header + a turn for the matching session"
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color --preview conv-aaaa-1111-1111-1111-111111111111 2>&1)"
assert_contains "T17.preview_project"  "alpha" "$out"
assert_contains "T17.preview_session"  "session conv-aaaa" "$out"
assert_contains "T17.preview_turn"     "configure session timeout" "$out"

echo
echo "Test 18: text output includes cwd-aware resume one-liner per row"
out="$(RUN '"session timeout"' --format text)"
# Conversation A has project_path=/home/u/projects/alpha; assert the (cd ... && claude --resume ...) form
assert_contains "T18.cwd_resume_alpha" "(cd /home/u/projects/alpha && claude --resume conv-aaaa" "$out"
assert_contains "T18.cwd_resume_beta"  "(cd /home/u/projects/beta && claude --resume conv-cccc"  "$out"

echo
echo "Test 19: TSV column count and project_path column present"
out="$(RUN '"session timeout"' --format tsv)"
# Take the first line, count tab-separated columns
first_line="$(printf '%s\n' "$out" | head -n 1)"
col_count="$(printf '%s' "$first_line" | awk -F'\t' '{print NF}')"
assert_eq        "T19.col_count_7"  "7"  "$col_count"
# Column 3 should be the absolute project_path
proj_path_col="$(printf '%s' "$first_line" | awk -F'\t' '{print $3}')"
case "$proj_path_col" in
  "/home/u/projects/alpha"|"/home/u/projects/beta")
    PASS=$((PASS+1)); echo "  PASS  T19.col3_is_project_path"
    ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T19.col3_is_project_path — got '$proj_path_col'" >&2
    ;;
esac

echo
echo "Test 20: missing project_path → degraded one-liner with '# original project path unknown'"
DB3="$(mktemp -t ccsearch-fixture-no-path.XXXXXX.db)"
sqlite3 "$DB3" <<'SQL'
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  raw_content TEXT,
  tool_operations TEXT,
  message_uuid TEXT NOT NULL,
  parent_uuid TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, searchable_text)
  VALUES (new.id, new.content || ' ' || COALESCE(new.tool_operations, ''));
END;
-- conversation with empty project_path
INSERT INTO messages VALUES
  ('mx1', 'conv-x', '', '', 1735689600000, 'user', 'pathless conversation about widgets', NULL, NULL, 'ux1', NULL, 0),
  ('mx2', 'conv-x', '', '', 1735689610000, 'assistant', 'widgets are great', NULL, NULL, 'ax1', 'ux1', 0);
SQL
out="$(CCSEARCH_DB="$DB3" "$CCSEARCH" --no-color --format text widgets 2>&1)"
assert_contains "T20.degraded_oneliner" "claude --resume conv-x  # original project path unknown" "$out"
# And in tsv, column 3 should be the empty string
out_tsv="$(CCSEARCH_DB="$DB3" "$CCSEARCH" --no-color --format tsv widgets 2>&1)"
first_line="$(printf '%s\n' "$out_tsv" | head -n 1)"
proj_path_col="$(printf '%s' "$first_line" | awk -F'\t' '{print $3}')"
assert_eq "T20.tsv_col3_empty" "" "$proj_path_col"
rm -f "$DB3"

echo
echo "Test 21: --help exits 0 and mentions Node 22.5"
out="$("$CCSEARCH" --help 2>&1)"
code="$("$CCSEARCH" --help >/dev/null 2>&1; echo $?)"
assert_eq        "T21.exit_0" "0" "$code"
assert_contains  "T21.help_node_version" "Node.js ≥ 22.5" "$out"

echo
echo "Test 22.4: indexer builds an FTS index from a JSONL tree"
INDEXER_TMP="$(mktemp -d -t ccsearch-indexer.XXX)"
mkdir -p "$INDEXER_TMP/.claude/projects/-home-foo-alpha"
mkdir -p "$INDEXER_TMP/.claude/projects/-home-foo-beta"
python3 - "$INDEXER_TMP/.claude/projects/-home-foo-alpha/sess-alpha.jsonl" "$INDEXER_TMP/.claude/projects/-home-foo-beta/sess-beta.jsonl" <<'PY'
import json, sys
records_alpha = [
    {"type":"user","sessionId":"sess-alpha","uuid":"u1","parentUuid":None,"cwd":"/home/foo/alpha","timestamp":"2026-04-01T12:00:00Z","message":{"role":"user","content":"Question about SeekersGuidance integration"}},
    {"type":"assistant","sessionId":"sess-alpha","uuid":"a1","parentUuid":"u1","cwd":"/home/foo/alpha","timestamp":"2026-04-01T12:00:01Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Considering SeekersGuidance approach"},{"type":"text","text":"Configure it via OAuth."}]}},
    {"type":"tool_result","sessionId":"sess-alpha","uuid":"t1","parentUuid":"a1","cwd":"/home/foo/alpha","timestamp":"2026-04-01T12:00:02Z","message":{"role":"user","content":"tool ran fine"}},
    {"type":"attachment","sessionId":"sess-alpha","uuid":"at1","cwd":"/home/foo/alpha","timestamp":"2026-04-01T12:00:03Z"},
    {"type":"file-history-snapshot","timestamp":None},
    {"type":"system","sessionId":"sess-alpha","timestamp":"2026-04-01T12:00:04Z","content":"system text"},
]
records_beta = [
    {"type":"user","sessionId":"sess-beta","uuid":"u2","parentUuid":None,"cwd":"/home/foo/beta","timestamp":"2026-04-02T09:00:00Z","message":{"role":"user","content":"Plot density of distinct words"}},
    {"type":"assistant","sessionId":"sess-beta","uuid":"a2","parentUuid":"u2","cwd":"/home/foo/beta","timestamp":"2026-04-02T09:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"Use matplotlib histograms."}]}},
]
with open(sys.argv[1], "w") as f:
    for r in records_alpha:
        f.write(json.dumps(r) + "\n")
    f.write("not valid json\n")
with open(sys.argv[2], "w") as f:
    for r in records_beta:
        f.write(json.dumps(r) + "\n")
PY

# Snapshot mtimes before the pass for the read-only invariant test
PRE_SNAP="$(find "$INDEXER_TMP/.claude/projects" -name "*.jsonl" -printf "%T@ %s %p\n" | sort)"

# First indexer run via ccsearch
out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --no-color --format text SeekersGuidance 2>&1)"
case "$out" in
  *SeekersGuidance*alpha*) PASS=$((PASS+1)); echo "  PASS  T22.4.indexer_finds_term" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T22.4.indexer_finds_term — output: $out" >&2 ;;
esac

# Multi-block parsing: thinking AND text should both index → both can be found
out_th="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --no-color --format text 'Considering' 2>&1)"
out_tx="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --no-color --format text 'OAuth' 2>&1)"
assert_contains "T22.4.thinking_block_indexed" "Considering"  "$out_th"
assert_contains "T22.4.text_block_indexed"     "OAuth"        "$out_tx"

# --index-status reports
status_out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --index-status 2>&1)"
assert_contains "T22.4.status_lists_db_path"   "index.db"     "$status_out"
assert_contains "T22.4.status_lists_messages"  "messages:"    "$status_out"
assert_contains "T22.4.status_pending_none"    "pending:    none" "$status_out"

# Read-only invariant: JSONL files unchanged after a pass
POST_SNAP="$(find "$INDEXER_TMP/.claude/projects" -name "*.jsonl" -printf "%T@ %s %p\n" | sort)"
if [ "$PRE_SNAP" = "$POST_SNAP" ]; then
  PASS=$((PASS+1)); echo "  PASS  T22.4.jsonl_readonly_invariant"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T22.4.jsonl_readonly_invariant — JSONL mtime/size changed" >&2
fi

# Incremental: append to one file, re-run, new content should be findable
echo '{"type":"user","sessionId":"sess-alpha","uuid":"u3","parentUuid":null,"cwd":"/home/foo/alpha","timestamp":"2026-04-03T12:00:00Z","message":{"role":"user","content":"UNIQUE_MARKER_FOR_INCREMENTAL_TEST"}}' >> "$INDEXER_TMP/.claude/projects/-home-foo-alpha/sess-alpha.jsonl"
# Force mtime forward — `find -newer` granularity issues
touch -d "+5 seconds" "$INDEXER_TMP/.claude/projects/-home-foo-alpha/sess-alpha.jsonl"
out_inc="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --no-color --format text UNIQUE_MARKER_FOR_INCREMENTAL_TEST 2>&1)"
assert_contains "T22.4.incremental_picks_up_new_message" "UNIQUE_MARKER_FOR_INCREMENTAL_TEST" "$out_inc"

# --reindex still works
reindex_out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$CCSEARCH" --reindex 2>&1)"
assert_contains "T22.4.reindex_summary" "indexed" "$reindex_out"

rm -rf "$INDEXER_TMP"

echo
echo "Test 22.5: --flag=value form is accepted (regression test for slash-command usage)"
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" '"session timeout"' --format=text --no-color --limit=10 2>&1)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" '"session timeout"' --format=text --no-color --limit=10 >/dev/null 2>&1; echo $?)"
assert_eq        "T22b.exit_0_with_equals_form" "0" "$code"
assert_contains  "T22b.row_present"            "alpha" "$out"
# Also assert --project=substr works (used in slash command examples)
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --format=text --no-color session --project=beta 2>&1)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" --format=text --no-color session --project=beta >/dev/null 2>&1; echo $?)"
assert_eq        "T22b.exit_0_project_equals" "0" "$code"
assert_contains  "T22b.beta_present"          "beta" "$out"

echo
echo "Test 22: -i without TTY exits 2 with a clear message"
# stdin redirection makes it non-TTY
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color -i 2>&1 < /dev/null)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color -i > /dev/null 2>&1 < /dev/null; echo $?)"
assert_eq        "T22.exit_2" "2" "$code"
assert_contains  "T22.tty_message" "requires a TTY" "$out"

echo
echo "Test 23: --help exits 0, writes to stdout, stderr is empty"
out_stdout="$("$CCSEARCH" --help 2>/dev/null)"
out_stderr="$("$CCSEARCH" --help 2>&1 >/dev/null)"
code="$("$CCSEARCH" --help >/dev/null 2>&1; echo $?)"
assert_eq        "T23.exit_0"      "0" "$code"
assert_contains  "T23.stdout_used" "usage:" "$out_stdout"
assert_eq        "T23.stderr_empty" "" "$out_stderr"

echo
echo "Test 24: -h short form matches --help byte-for-byte"
out_h="$("$CCSEARCH" -h 2>/dev/null)"
out_long="$("$CCSEARCH" --help 2>/dev/null)"
if [ "$out_h" = "$out_long" ]; then
  PASS=$((PASS+1)); echo "  PASS  T24.short_form_matches"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T24.short_form_matches — -h and --help differ" >&2
fi

echo
echo "Test 25: --help overrides other flags (no DB access, no query attempt)"
# Even with a bogus DB path and contradictory flags, --help should exit 0
out="$(CCSEARCH_DB=/nonexistent/no.db "$CCSEARCH" --help --regex 'foo' --limit 5 2>&1)"
code="$(CCSEARCH_DB=/nonexistent/no.db "$CCSEARCH" --help --regex 'foo' --limit 5 >/dev/null 2>&1; echo $?)"
assert_eq        "T25.exit_0_override" "0" "$code"
assert_contains  "T25.help_printed"    "usage:" "$out"

echo
echo "Test 27: selectMode dispatch matrix (unit-style, via CCSEARCH_TEST export)"
SELECT_MODE_OUT="$(CCSEARCH_TEST=1 node -e '
const { selectMode } = require(process.argv[1]);
function check(label, expected, actual) {
  if (expected === actual) {
    console.log("OK", label);
  } else {
    console.log("FAIL", label, "expected", expected, "got", actual);
    process.exitCode = 1;
  }
}
// New default: bare invocation on a TTY → picker
check("bare-tty",            "picker",   selectMode({interactive:false,list:false,format:null,regex:null},{stdinTTY:true,stdoutTTY:true}));
// Pipe (stdout not a TTY) forces one-shot
check("stdout-piped",        "one-shot", selectMode({interactive:false,list:false,format:null,regex:null},{stdinTTY:true,stdoutTTY:false}));
// Non-TTY stdin (e.g., heredoc, command substitution) forces one-shot
check("stdin-piped",         "one-shot", selectMode({interactive:false,list:false,format:null,regex:null},{stdinTTY:false,stdoutTTY:true}));
// --list always forces one-shot on TTY
check("list-on-tty",         "one-shot", selectMode({interactive:false,list:true, format:null,regex:null},{stdinTTY:true,stdoutTTY:true}));
// --format=text forces one-shot on TTY
check("format-text",         "one-shot", selectMode({interactive:false,list:false,format:"text",regex:null},{stdinTTY:true,stdoutTTY:true}));
// --format=tsv forces one-shot on TTY
check("format-tsv",          "one-shot", selectMode({interactive:false,list:false,format:"tsv", regex:null},{stdinTTY:true,stdoutTTY:true}));
// --regex forces one-shot on TTY
check("regex-on-tty",        "one-shot", selectMode({interactive:false,list:false,format:null,regex:"foo"},{stdinTTY:true,stdoutTTY:true}));
// -i forces picker even when nothing else would
check("dash-i-on-tty",       "picker",   selectMode({interactive:true, list:false,format:null,regex:null},{stdinTTY:true,stdoutTTY:true}));
// -i forces picker even on non-TTY (picker itself will then EXIT_ENV; the dispatch correctly chooses picker)
check("dash-i-non-tty",      "picker",   selectMode({interactive:true, list:false,format:null,regex:null},{stdinTTY:false,stdoutTTY:false}));
' "$CCSEARCH" 2>&1)"
if echo "$SELECT_MODE_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T27.selectMode_matrix"
  echo "$SELECT_MODE_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T27.selectMode_matrix ($(echo "$SELECT_MODE_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 28: --list forces text output (one-shot) on a TTY-like invocation"
# Force non-TTY stdin so the picker can't engage; --list is the explicit signal.
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color --list 'session timeout' </dev/null 2>&1)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color --list 'session timeout' >/dev/null </dev/null 2>&1; echo $?)"
assert_eq        "T28.exit_0" "0" "$code"
assert_contains  "T28.text_output_present" "alpha" "$out"

echo
echo "Test 29: --list -i exits 1 (mutex)"
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --list -i 2>&1)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" --list -i >/dev/null 2>&1; echo $?)"
assert_eq        "T29.exit_1" "1" "$code"
assert_contains  "T29.mutex_message" "mutually exclusive" "$out"

echo
echo "Test 30: slash-command shape (--format=text --no-color --limit=10) still works"
out="$(CCSEARCH_DB="$DB" "$CCSEARCH" --format=text --no-color --limit=10 'session timeout' </dev/null 2>&1)"
code="$(CCSEARCH_DB="$DB" "$CCSEARCH" --format=text --no-color --limit=10 'session timeout' >/dev/null </dev/null 2>&1; echo $?)"
assert_eq        "T30.exit_0" "0" "$code"
assert_contains  "T30.row_present" "alpha" "$out"

echo
echo "Test 31: piped query produces TSV (stdout not a TTY → one-shot, default tsv)"
first_line="$(CCSEARCH_DB="$DB" "$CCSEARCH" 'session timeout' 2>/dev/null | head -1)"
case "$first_line" in
  *$'\t'*)  PASS=$((PASS+1)); echo "  PASS  T31.tsv_when_piped" ;;
  *)        FAIL=$((FAIL+1)); echo "  FAIL  T31.tsv_when_piped — first line missing tab: $first_line" >&2 ;;
esac

echo
echo "Test 32: recentConversations — ordering, title synthesis, tail snippet, wrapper-skip"
# Build a minimal fixture with three conversations whose first-user-message and
# tail messages exercise the spec.
DB_REC="$(mktemp -t ccsearch-recent.XXXXXX.db)"
sqlite3 "$DB_REC" <<'SQL'
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  raw_content TEXT,
  tool_operations TEXT,
  message_uuid TEXT NOT NULL,
  parent_uuid TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_project ON messages(project_path);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_type ON messages(type);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, searchable_text)
  VALUES (new.id, new.content || ' ' || COALESCE(new.tool_operations, ''));
END;

-- Conversation A (oldest): simple first-user-message
INSERT INTO messages VALUES
  ('rA1', 'conv-A', '/p/a', 'a', 1000000, 'user',
   'how do I write a custom Claude Code skill?', NULL, NULL, 'uA1', NULL, 0),
  ('rA2', 'conv-A', '/p/a', 'a', 1000010, 'assistant',
   'create a SKILL.md file…', NULL, NULL, 'aA1', 'uA1', 0);

-- Conversation B (newest): first user message is a wrapper, second is real
INSERT INTO messages VALUES
  ('rB1', 'conv-B', '/p/b', 'b', 2000000, 'user',
   '<command-name>opsx:propose</command-name>', NULL, NULL, 'uB1', NULL, 0),
  ('rB2', 'conv-B', '/p/b', 'b', 2000005, 'user',
   'actual user question about something', NULL, NULL, 'uB2', 'uB1', 0),
  ('rB3', 'conv-B', '/p/b', 'b', 2000010, 'assistant',
   'last assistant message in B with some content', NULL, NULL, 'aB1', 'uB2', 0);

-- Conversation C (middle age): first user message is 200+ chars of x
INSERT INTO messages VALUES
  ('rC1', 'conv-C', '/p/c', 'c', 1500000, 'user',
   'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   NULL, NULL, 'uC1', NULL, 0),
  ('rC2', 'conv-C', '/p/c', 'c', 1500010, 'assistant',
   'reply', NULL, NULL, 'aC1', 'uC1', 0);
SQL

OUT="$(CCSEARCH_TEST=1 node -e '
const { recentConversations } = require(process.argv[1]);
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const rows = recentConversations(db, { limit: 10, projectFilter: null });
console.log("LEN", rows.length);
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  console.log(i, "sid=" + r.sessionId, "title=" + (r.title === null ? "<null>" : JSON.stringify(r.title)), "tail=" + JSON.stringify((r.snippet || "").slice(0,60)));
}
' "$CCSEARCH" "$DB_REC" 2>&1)"
# Order: B (2M ts) → C (1.5M ts) → A (1M ts)
case "$OUT" in
  *"LEN 3"*)            PASS=$((PASS+1)); echo "  PASS  T32.three_rows" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.three_rows — got: $OUT" >&2 ;;
esac
case "$OUT" in
  *"0 sid=conv-B"*)     PASS=$((PASS+1)); echo "  PASS  T32.order_newest_first" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.order_newest_first — got: $OUT" >&2 ;;
esac
case "$OUT" in
  *"2 sid=conv-A"*)     PASS=$((PASS+1)); echo "  PASS  T32.order_oldest_last" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.order_oldest_last — got: $OUT" >&2 ;;
esac
# B's title: wrapper-skipped → "actual user question about something"
case "$OUT" in
  *'title="actual user question about something"'*) PASS=$((PASS+1)); echo "  PASS  T32.wrapper_skipped" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.wrapper_skipped — got: $OUT" >&2 ;;
esac
# C's title: 200+ x's, capped at 80 chars + "…"
case "$OUT" in
  *'title="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…"'*)
                        PASS=$((PASS+1)); echo "  PASS  T32.title_capped_at_80" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.title_capped_at_80 — got: $OUT" >&2 ;;
esac
# B's tail: most recent message = "last assistant message in B with some content"
case "$OUT" in
  *'tail="last assistant message in B with some content"'*)
                        PASS=$((PASS+1)); echo "  PASS  T32.tail_from_latest_message" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T32.tail_from_latest_message — got: $OUT" >&2 ;;
esac
rm -f "$DB_REC"

echo
echo "Test 33: recentConversations — empty index returns []"
DB_EMPTY="$(mktemp -t ccsearch-empty.XXXXXX.db)"
sqlite3 "$DB_EMPTY" <<'SQL'
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, project_path TEXT NOT NULL,
  project_name TEXT NOT NULL, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
  content TEXT, raw_content TEXT, tool_operations TEXT,
  message_uuid TEXT NOT NULL, parent_uuid TEXT, created_at INTEGER DEFAULT (unixepoch())
);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
SQL
OUT_EMPTY="$(CCSEARCH_TEST=1 node -e '
const { recentConversations } = require(process.argv[1]);
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const rows = recentConversations(db, { limit: 10, projectFilter: null });
console.log("LEN", rows.length);
' "$CCSEARCH" "$DB_EMPTY" 2>&1)"
case "$OUT_EMPTY" in
  *"LEN 0"*)            PASS=$((PASS+1)); echo "  PASS  T33.empty_returns_empty_array" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T33.empty_returns_empty_array — got: $OUT_EMPTY" >&2 ;;
esac
rm -f "$DB_EMPTY"

echo
echo "Test 34: isWrapperContent — unit tests for the wrapper-detection helper"
WRAP_OUT="$(CCSEARCH_TEST=1 node -e '
const { isWrapperContent } = require(process.argv[1]);
function check(label, expected, actual) {
  if (expected === actual) console.log("OK", label);
  else { console.log("FAIL", label, "expected", expected, "got", actual); process.exitCode = 1; }
}
check("command-name",         true,  isWrapperContent("<command-name>opsx:propose</command-name>"));
check("local-command-caveat", true,  isWrapperContent("<local-command-caveat>blah</local-command-caveat>"));
check("task-notification",    true,  isWrapperContent("<task-notification>x</task-notification>"));
check("leading-whitespace",   true,  isWrapperContent("   <command-name>x"));
check("real-user",            false, isWrapperContent("how do I write a skill"));
check("empty",                true,  isWrapperContent(""));
check("null",                 true,  isWrapperContent(null));
check("not-wrapper-but-tag",  false, isWrapperContent("<html>not one of ours</html>"));
' "$CCSEARCH" 2>&1)"
if echo "$WRAP_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T34.isWrapperContent_cases"
  echo "$WRAP_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T34.isWrapperContent_cases ($(echo "$WRAP_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 35: --dangerously-skip-permissions parses + --help mentions it"
out_help="$("$CCSEARCH" --help 2>&1)"
assert_contains "T35.help_mentions_flag" "--dangerously-skip-permissions" "$out_help"
assert_contains "T35.help_mentions_alt_enter" "Alt+Enter" "$out_help"

# parseArgs flips the bool
PARSE_OUT="$(CCSEARCH_TEST=1 node -e '
const { parseArgs } = require(process.argv[1]);
const on  = parseArgs(["--dangerously-skip-permissions"]);
const off = parseArgs([]);
console.log("on", on.dangerouslySkipPermissions);
console.log("off", off.dangerouslySkipPermissions);
' "$CCSEARCH" 2>&1)"
case "$PARSE_OUT" in
  *"on true"*"off false"*) PASS=$((PASS+1)); echo "  PASS  T35.parser_branch" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T35.parser_branch — got: $PARSE_OUT" >&2 ;;
esac

echo
echo "Test 36: --dangerously-skip-permissions is silently ignored in one-shot output"
# Force text format so resumeOneLiner shows up (without --format the piped capture defaults to tsv).
out_oneshot="$(CCSEARCH_DB="$DB" "$CCSEARCH" --no-color --format=text --dangerously-skip-permissions 'session timeout' </dev/null 2>&1)"
case "$out_oneshot" in
  *"--dangerously-skip-permissions"*)
                                FAIL=$((FAIL+1)); echo "  FAIL  T36.flag_not_in_oneshot — leaked into output" >&2 ;;
  *"claude --resume conv-aaaa"*)
                                PASS=$((PASS+1)); echo "  PASS  T36.flag_not_in_oneshot" ;;
  *)                            FAIL=$((FAIL+1)); echo "  FAIL  T36.flag_not_in_oneshot — unexpected output: $out_oneshot" >&2 ;;
esac

echo
echo "Test 37: buildClaudeArgs — all action shapes (without + with saved name)"
BCA_OUT="$(CCSEARCH_TEST=1 node -e '
const { buildClaudeArgs } = require(process.argv[1])._test;
const row = { sessionId: "abc" };
function check(label, expected, actual) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log("OK", label);
  else { console.log("FAIL", label, "expected", e, "got", a); process.exitCode = 1; }
}
check("resume_no_name",          ["--resume","abc"],                               buildClaudeArgs("resume", row, null));
check("resume_with_name",        ["--name","my chat","--resume","abc"],            buildClaudeArgs("resume", row, "my chat"));
check("fork_no_name",            ["--fork-session","--resume","abc"],              buildClaudeArgs("fork", row, null));
check("fork_with_name",          ["--fork-session","--name","f","--resume","abc"], buildClaudeArgs("fork", row, "f"));
check("dangerous_no_name",       ["--dangerously-skip-permissions","--resume","abc"], buildClaudeArgs("resume-dangerous", row, null));
check("dangerous_with_name",     ["--dangerously-skip-permissions","--name","d","--resume","abc"], buildClaudeArgs("resume-dangerous", row, "d"));
check("remote_no_name",          ["--remote-control","--resume","abc"],            buildClaudeArgs("resume-remote-control", row, null));
check("remote_with_name",        ["--remote-control","rc","--resume","abc"],       buildClaudeArgs("resume-remote-control", row, "rc"));
check("remote_suppresses_name",  true, !buildClaudeArgs("resume-remote-control", row, "x").includes("--name"));
check("empty_name_treated_null", ["--resume","abc"],                               buildClaudeArgs("resume", row, ""));
' "$HERE/picker.js" 2>&1)"
if echo "$BCA_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T37.buildClaudeArgs"
  echo "$BCA_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T37.buildClaudeArgs ($(echo "$BCA_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 38: sessions.json — load/save round-trip + corrupt-file recovery"
TMPCFG="$(mktemp -d -t ccsearch-cfg.XXXXXX)"
SES_OUT="$(CCSEARCH_TEST=1 node -e '
const { loadSessionStore, saveSessionStore, emptySessionStore } = require(process.argv[1]);
const fs = require("node:fs"); const p = process.argv[2];
// load on missing file
let s = loadSessionStore(p);
console.log("EMPTY", s.version, Object.keys(s.names).length, s.pins.length);
// round-trip
s.names["conv-a"] = "alpha"; s.names["conv-b"] = "beta"; s.pins.push("conv-a");
saveSessionStore(s, p);
console.log("EXISTS", fs.existsSync(p) ? "yes" : "no");
console.log("NO_TMP", fs.existsSync(p + ".tmp") ? "yes" : "no");
const reloaded = loadSessionStore(p);
console.log("RELOADED", reloaded.names["conv-a"], reloaded.names["conv-b"], reloaded.pins[0]);
// corrupt-file recovery
fs.writeFileSync(p, "{not valid");
const rec = loadSessionStore(p);
console.log("RECOVERED", rec.version, Object.keys(rec.names).length, rec.pins.length);
// type-defensive: non-string name values must be filtered
fs.writeFileSync(p, JSON.stringify({ version: 1, names: { a: "ok", b: 42, c: "" }, pins: ["x", null] }));
const filt = loadSessionStore(p);
console.log("FILTERED", filt.names.a, filt.names.b, filt.names.c, filt.pins.join(","));
' "$CCSEARCH" "$TMPCFG/sessions.json" 2>&1)"
case "$SES_OUT" in
  *"EMPTY 1 0 0"*"EXISTS yes"*"NO_TMP no"*"RELOADED alpha beta conv-a"*"RECOVERED 1 0 0"*"FILTERED ok undefined undefined x"*)
    PASS=$((PASS+1)); echo "  PASS  T38.sessions_json_round_trip" ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T38.sessions_json_round_trip — got:" >&2
    echo "$SES_OUT" | sed 's/^/         /' >&2 ;;
esac
rm -rf "$TMPCFG"

echo
echo "Test 39: --print-names — empty config + populated config"
TMPCFG="$(mktemp -d -t ccsearch-cfg.XXXXXX)"
PN_EMPTY="$(XDG_CONFIG_HOME="$TMPCFG" "$CCSEARCH" --print-names 2>&1)"
assert_eq "T39.empty_prints_braces" "{}" "$PN_EMPTY"
mkdir -p "$TMPCFG/krmrn42-skills/chat-search"
echo '{"version":1,"names":{"conv-xyz":"named one"},"pins":[]}' > "$TMPCFG/krmrn42-skills/chat-search/sessions.json"
PN_FULL="$(XDG_CONFIG_HOME="$TMPCFG" "$CCSEARCH" --print-names 2>&1)"
assert_contains "T39.populated_prints_content" "named one" "$PN_FULL"
assert_contains "T39.populated_prints_session_id" "conv-xyz" "$PN_FULL"
# --print-names short-circuits before any DB work — should succeed even without
# a usable index. Use a non-existent --db-path to confirm.
PN_NODB="$(XDG_CONFIG_HOME="$TMPCFG" "$CCSEARCH" --db-path "/nonexistent/path.db" --print-names 2>&1)"
assert_contains "T39.short_circuits_before_db" "named one" "$PN_NODB"
rm -rf "$TMPCFG"

echo
echo "Test 40: recentConversations — saved-name overlay overrides synthesized title"
RC_NAME_OUT="$(CCSEARCH_TEST=1 node -e '
const { recentConversations } = require(process.argv[1]);
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const store = { version: 1, names: { "conv-aaaa-1111-1111-1111-111111111111": "my custom name" }, pins: [] };
const rows = recentConversations(db, { limit: 10, projectFilter: null, sessionStore: store });
const named = rows.find(r => r.sessionId === "conv-aaaa-1111-1111-1111-111111111111");
const other = rows.find(r => r.sessionId !== "conv-aaaa-1111-1111-1111-111111111111");
console.log("NAMED", named ? named.title : "missing");
console.log("OTHER_NOT_OVERRIDDEN", other && other.title && other.title !== "my custom name" ? "yes" : "no");
// Without the store, synthesized title runs (regression check)
const rowsNoStore = recentConversations(db, { limit: 10, projectFilter: null });
const sameRow = rowsNoStore.find(r => r.sessionId === "conv-aaaa-1111-1111-1111-111111111111");
console.log("NO_STORE_SYNTHESIZED", sameRow && sameRow.title && sameRow.title !== "my custom name" ? "yes" : "no");
' "$CCSEARCH" "$DB" 2>&1)"
case "$RC_NAME_OUT" in
  *"NAMED my custom name"*"OTHER_NOT_OVERRIDDEN yes"*"NO_STORE_SYNTHESIZED yes"*)
    PASS=$((PASS+1)); echo "  PASS  T40.recent_conv_name_overlay" ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T40.recent_conv_name_overlay — got:" >&2
    echo "$RC_NAME_OUT" | sed 's/^/         /' >&2 ;;
esac

echo
echo "Test 26: drift guard — every parser flag appears in --help"
# Extract long-form flags from source: lines like `case "--something":`. Strip
# line-comment lines first so `case "--flag":` appearing inside a // comment
# (documenting the convention) doesn't get picked up as a real parser case.
PARSER_FLAGS=$(grep -v -E '^[[:space:]]*//' "$CCSEARCH" \
  | grep -oE 'case "--[a-z][a-z-]+"' \
  | sed -E 's/case "(.*)"/\1/' \
  | sort -u)
# Extract long-form flags from --help output (any --token)
HELP_FLAGS=$("$CCSEARCH" --help 2>/dev/null | grep -oE -- '--[a-z][a-z-]+' | sort -u)
MISSING_IN_HELP=$(comm -23 <(echo "$PARSER_FLAGS") <(echo "$HELP_FLAGS"))
EXTRA_IN_HELP=$(comm -13 <(echo "$PARSER_FLAGS") <(echo "$HELP_FLAGS"))
if [ -z "$MISSING_IN_HELP" ]; then
  PASS=$((PASS+1)); echo "  PASS  T26.parser_flags_all_in_help"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T26.parser_flags_all_in_help — missing in help:" >&2
  echo "$MISSING_IN_HELP" | sed 's/^/         /' >&2
fi
# An extra flag in help (mentioned but not parseable) is also a bug worth catching.
if [ -z "$EXTRA_IN_HELP" ]; then
  PASS=$((PASS+1)); echo "  PASS  T26.no_phantom_help_flags"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T26.no_phantom_help_flags — flags in help but not parsed:" >&2
  echo "$EXTRA_IN_HELP" | sed 's/^/         /' >&2
fi

# --- Summary ------------------------------------------------------------

echo
echo "----------------------------------------"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "----------------------------------------"

[[ "$FAIL" == "0" ]]
