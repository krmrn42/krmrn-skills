#!/usr/bin/env bash
# multivac.test.sh — fixture-DB smoke test for multivac.
#
# Builds a temporary SQLite database matching the live Claude Code FTS5 schema,
# populates 5 fake conversations across 2 fake projects, and asserts on row
# counts and exit codes for several invocations. Does NOT touch the user's
# real ~/.claude/conversation-search.db.
#
# Usage:
#   bash packages/multivac/test/multivac.test.sh [--keep]
#
# --keep leaves the fixture DB on disk (printed at the end) for manual probing.

set -u  # NB: -e is intentionally OFF — we test exit codes explicitly.

HERE="$(cd "$(dirname "$0")" && pwd)"
MULTIVAC="$HERE/../dist/multivac.js"

# Resolve sqlite3 once (some installs have it bundled with Python only)
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "multivac.test.sh: sqlite3 binary required for the test (used to build the fixture)" >&2
  exit 2
fi

DB="$(mktemp -t multivac-fixture.XXXXXX.db)"
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

assert_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    printf '  PASS  %s\n' "$name"
    PASS=$((PASS+1))
  else
    printf '  FAIL  %s — unexpected substring %q present in output\n' "$name" "$needle" >&2
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
  source TEXT NOT NULL DEFAULT 'claude',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_project ON messages(project_path);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_type ON messages(type);
CREATE INDEX idx_messages_source ON messages(source);
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
   1735689600000, 'user', 'how do I configure session timeout for the auth service', NULL, NULL, 'u1', NULL, 'claude', 0),
  ('m2', 'conv-aaaa-1111-1111-1111-111111111111', '/home/u/projects/alpha', 'alpha',
   1735689610000, 'assistant', 'set SESSION_TIMEOUT_SECONDS in your env. there is no timeout for refresh tokens.', NULL, NULL, 'a1', 'u1', 'claude', 0),
  ('m3', 'conv-aaaa-1111-1111-1111-111111111111', '/home/u/projects/alpha', 'alpha',
   1735689620000, 'tool_use', NULL, NULL, '{"command":"grep -r SESSION_TIMEOUT_SECONDS"}', 't1', 'a1', 'claude', 0);

-- Conversation B: in project alpha, talks about regex parsing — has a TOKEN_DEADBEEF marker
INSERT INTO messages VALUES
  ('m4', 'conv-bbbb-2222-2222-2222-222222222222', '/home/u/projects/alpha', 'alpha',
   1735776000000, 'user', 'I need to write a regex to parse log timestamps', NULL, NULL, 'u2', NULL, 'claude', 0),
  ('m5', 'conv-bbbb-2222-2222-2222-222222222222', '/home/u/projects/alpha', 'alpha',
   1735776010000, 'assistant', 'try this regex ^[A-Z]{3} and validate with TOKEN_DEADBEEF as a sentinel', NULL, NULL, 'a2', 'u2', 'claude', 0);

-- Conversation C: in project beta, talks about session timeout (different project)
INSERT INTO messages VALUES
  ('m6', 'conv-cccc-3333-3333-3333-333333333333', '/home/u/projects/beta', 'beta',
   1735862400000, 'user', 'why does my session timeout differ between staging and prod', NULL, NULL, 'u3', NULL, 'claude', 0),
  ('m7', 'conv-cccc-3333-3333-3333-333333333333', '/home/u/projects/beta', 'beta',
   1735862410000, 'assistant', 'check your load balancer idle session timeout — it overrides app config', NULL, NULL, 'a3', 'u3', 'claude', 0);

-- Conversation D: in project beta, much older — for --since testing
INSERT INTO messages VALUES
  ('m8', 'conv-dddd-4444-4444-4444-444444444444', '/home/u/projects/beta', 'beta',
   1700000000000, 'user', 'what does session affinity do', NULL, NULL, 'u4', NULL, 'claude', 0),
  ('m9', 'conv-dddd-4444-4444-4444-444444444444', '/home/u/projects/beta', 'beta',
   1700000010000, 'assistant', 'session affinity pins requests to the same backend pod', NULL, NULL, 'a4', 'u4', 'claude', 0);

-- Conversation E: tool_use only — testing default-excludes-tools
INSERT INTO messages VALUES
  ('m10', 'conv-eeee-5555-5555-5555-555555555555', '/home/u/projects/alpha', 'alpha',
    1735948800000, 'user', 'unrelated query about deployment', NULL, NULL, 'u5', NULL, 'claude', 0),
  ('m11', 'conv-eeee-5555-5555-5555-555555555555', '/home/u/projects/alpha', 'alpha',
    1735948810000, 'tool_result', 'output: PROCESS_KILLED_OOM', NULL, NULL, 't5', 'u5', 'claude', 0);
SQL

# All output below is captured for assertion. Run multivac with --no-color and explicit --format text.
RUN() { MULTIVAC_DB="$DB" "$MULTIVAC" --no-color "$@" 2>&1; }
RUN_CODE() { MULTIVAC_DB="$DB" "$MULTIVAC" --no-color "$@" >/dev/null 2>&1; echo $?; }

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
out="$(MULTIVAC_DB=/nonexistent/path/to/no.db "$MULTIVAC" --no-color foo 2>&1)"
code="$(MULTIVAC_DB=/nonexistent/path/to/no.db "$MULTIVAC" --no-color foo >/dev/null 2>&1; echo $?)"
assert_eq        "T14.exit_2" "2" "$code"
assert_contains  "T14.message" "not found" "$out"

echo
echo "Test 15: schema drift (drop project_name column) → exit 2"
DB2="$(mktemp -t multivac-fixture-broken.XXXXXX.db)"
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
out="$(MULTIVAC_DB="$DB2" "$MULTIVAC" --no-color foo 2>&1)"
code="$(MULTIVAC_DB="$DB2" "$MULTIVAC" --no-color foo >/dev/null 2>&1; echo $?)"
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
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color --preview conv-aaaa-1111-1111-1111-111111111111 2>&1)"
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
DB3="$(mktemp -t multivac-fixture-no-path.XXXXXX.db)"
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
  source TEXT NOT NULL DEFAULT 'claude',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, searchable_text)
  VALUES (new.id, new.content || ' ' || COALESCE(new.tool_operations, ''));
END;
-- conversation with empty project_path
INSERT INTO messages VALUES
  ('mx1', 'conv-x', '', '', 1735689600000, 'user', 'pathless conversation about widgets', NULL, NULL, 'ux1', NULL, 'claude', 0),
  ('mx2', 'conv-x', '', '', 1735689610000, 'assistant', 'widgets are great', NULL, NULL, 'ax1', 'ux1', 'claude', 0);
SQL
out="$(MULTIVAC_DB="$DB3" "$MULTIVAC" --no-color --format text widgets 2>&1)"
assert_contains "T20.degraded_oneliner" "claude --resume conv-x  # original project path unknown" "$out"
# And in tsv, column 3 should be the empty string
out_tsv="$(MULTIVAC_DB="$DB3" "$MULTIVAC" --no-color --format tsv widgets 2>&1)"
first_line="$(printf '%s\n' "$out_tsv" | head -n 1)"
proj_path_col="$(printf '%s' "$first_line" | awk -F'\t' '{print $3}')"
assert_eq "T20.tsv_col3_empty" "" "$proj_path_col"
rm -f "$DB3"

echo
echo "Test 21: --help exits 0 and mentions Node 22.5"
out="$("$MULTIVAC" --help 2>&1)"
code="$("$MULTIVAC" --help >/dev/null 2>&1; echo $?)"
assert_eq        "T21.exit_0" "0" "$code"
assert_contains  "T21.help_node_version" "Node.js ≥ 22.5" "$out"

echo
echo "Test 22.4: indexer builds an FTS index from a JSONL tree"
INDEXER_TMP="$(mktemp -d -t multivac-indexer.XXX)"
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

# First indexer run via multivac
out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --no-color --format text SeekersGuidance 2>&1)"
case "$out" in
  *SeekersGuidance*alpha*) PASS=$((PASS+1)); echo "  PASS  T22.4.indexer_finds_term" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T22.4.indexer_finds_term — output: $out" >&2 ;;
esac

# Multi-block parsing: thinking AND text should both index → both can be found
out_th="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --no-color --format text 'Considering' 2>&1)"
out_tx="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --no-color --format text 'OAuth' 2>&1)"
assert_contains "T22.4.thinking_block_indexed" "Considering"  "$out_th"
assert_contains "T22.4.text_block_indexed"     "OAuth"        "$out_tx"

# --index-status reports
status_out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --index-status 2>&1)"
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
out_inc="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --no-color --format text UNIQUE_MARKER_FOR_INCREMENTAL_TEST 2>&1)"
assert_contains "T22.4.incremental_picks_up_new_message" "UNIQUE_MARKER_FOR_INCREMENTAL_TEST" "$out_inc"

# --reindex still works
reindex_out="$(XDG_DATA_HOME="$INDEXER_TMP/xdg" HOME="$INDEXER_TMP" "$MULTIVAC" --reindex 2>&1)"
assert_contains "T22.4.reindex_summary" "indexed" "$reindex_out"

rm -rf "$INDEXER_TMP"

echo
echo "Test 22.5: --flag=value form is accepted (regression test for slash-command usage)"
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" '"session timeout"' --format=text --no-color --limit=10 2>&1)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" '"session timeout"' --format=text --no-color --limit=10 >/dev/null 2>&1; echo $?)"
assert_eq        "T22b.exit_0_with_equals_form" "0" "$code"
assert_contains  "T22b.row_present"            "alpha" "$out"
# Also assert --project=substr works (used in slash command examples)
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --format=text --no-color session --project=beta 2>&1)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" --format=text --no-color session --project=beta >/dev/null 2>&1; echo $?)"
assert_eq        "T22b.exit_0_project_equals" "0" "$code"
assert_contains  "T22b.beta_present"          "beta" "$out"

echo
echo "Test 22: -i without TTY exits 2 with a clear message"
# stdin redirection makes it non-TTY
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color -i 2>&1 < /dev/null)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color -i > /dev/null 2>&1 < /dev/null; echo $?)"
assert_eq        "T22.exit_2" "2" "$code"
assert_contains  "T22.tty_message" "requires a TTY" "$out"

echo
echo "Test 23: --help exits 0, writes to stdout, stderr is empty"
out_stdout="$("$MULTIVAC" --help 2>/dev/null)"
out_stderr="$("$MULTIVAC" --help 2>&1 >/dev/null)"
code="$("$MULTIVAC" --help >/dev/null 2>&1; echo $?)"
assert_eq            "T23.exit_0"           "0" "$code"
assert_contains      "T23.stdout_used"      "usage:" "$out_stdout"
assert_eq            "T23.stderr_empty"     "" "$out_stderr"
assert_contains      "T23.banner_multivac"  "usage: multivac" "$out_stdout"
assert_not_contains  "T23.no_ccsearch"      "ccsearch" "$out_stdout"

echo
echo "Test 24: -h short form matches --help byte-for-byte"
out_h="$("$MULTIVAC" -h 2>/dev/null)"
out_long="$("$MULTIVAC" --help 2>/dev/null)"
if [ "$out_h" = "$out_long" ]; then
  PASS=$((PASS+1)); echo "  PASS  T24.short_form_matches"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T24.short_form_matches — -h and --help differ" >&2
fi

echo
echo "Test 25: --help overrides other flags (no DB access, no query attempt)"
# Even with a bogus DB path and contradictory flags, --help should exit 0
out="$(MULTIVAC_DB=/nonexistent/no.db "$MULTIVAC" --help --regex 'foo' --limit 5 2>&1)"
code="$(MULTIVAC_DB=/nonexistent/no.db "$MULTIVAC" --help --regex 'foo' --limit 5 >/dev/null 2>&1; echo $?)"
assert_eq        "T25.exit_0_override" "0" "$code"
assert_contains  "T25.help_printed"    "usage:" "$out"

echo
echo "Test 27: selectMode dispatch matrix (unit-style, via MULTIVAC_TEST export)"
SELECT_MODE_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
// The dist bundle is ESM; use dynamic import() so we can load it and then
// read selectMode from the globalThis stash the bundle populates when
// MULTIVAC_TEST=1 is set. process.argv[1] is unavailable with --input-type=module
// so we inline the path directly.
await import("${MULTIVAC}");
const { selectMode } = globalThis.__multivac_test_exports__;
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
EOF
2>&1)"
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
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color --list 'session timeout' </dev/null 2>&1)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color --list 'session timeout' >/dev/null </dev/null 2>&1; echo $?)"
assert_eq        "T28.exit_0" "0" "$code"
assert_contains  "T28.text_output_present" "alpha" "$out"

echo
echo "Test 29: --list -i exits 1 (mutex)"
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --list -i 2>&1)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" --list -i >/dev/null 2>&1; echo $?)"
assert_eq        "T29.exit_1" "1" "$code"
assert_contains  "T29.mutex_message" "mutually exclusive" "$out"

echo
echo "Test 30: slash-command shape (--format=text --no-color --limit=10) still works"
out="$(MULTIVAC_DB="$DB" "$MULTIVAC" --format=text --no-color --limit=10 'session timeout' </dev/null 2>&1)"
code="$(MULTIVAC_DB="$DB" "$MULTIVAC" --format=text --no-color --limit=10 'session timeout' >/dev/null </dev/null 2>&1; echo $?)"
assert_eq        "T30.exit_0" "0" "$code"
assert_contains  "T30.row_present" "alpha" "$out"

echo
echo "Test 31: piped query produces TSV (stdout not a TTY → one-shot, default tsv)"
first_line="$(MULTIVAC_DB="$DB" "$MULTIVAC" 'session timeout' 2>/dev/null | head -1)"
case "$first_line" in
  *$'\t'*)  PASS=$((PASS+1)); echo "  PASS  T31.tsv_when_piped" ;;
  *)        FAIL=$((FAIL+1)); echo "  FAIL  T31.tsv_when_piped — first line missing tab: $first_line" >&2 ;;
esac

echo
echo "Test 32: recentConversations — ordering, title synthesis, tail snippet, wrapper-skip"
# Build a minimal fixture with three conversations whose first-user-message and
# tail messages exercise the spec.
DB_REC="$(mktemp -t multivac-recent.XXXXXX.db)"
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
  source TEXT NOT NULL DEFAULT 'claude',
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
   'how do I write a custom Claude Code skill?', NULL, NULL, 'uA1', NULL, 'claude', 0),
  ('rA2', 'conv-A', '/p/a', 'a', 1000010, 'assistant',
   'create a SKILL.md file…', NULL, NULL, 'aA1', 'uA1', 'claude', 0);

-- Conversation B (newest): first user message is a wrapper, second is real
INSERT INTO messages VALUES
  ('rB1', 'conv-B', '/p/b', 'b', 2000000, 'user',
   '<command-name>opsx:propose</command-name>', NULL, NULL, 'uB1', NULL, 'claude', 0),
  ('rB2', 'conv-B', '/p/b', 'b', 2000005, 'user',
   'actual user question about something', NULL, NULL, 'uB2', 'uB1', 'claude', 0),
  ('rB3', 'conv-B', '/p/b', 'b', 2000010, 'assistant',
   'last assistant message in B with some content', NULL, NULL, 'aB1', 'uB2', 'claude', 0);

-- Conversation C (middle age): first user message is 200+ chars of x
INSERT INTO messages VALUES
  ('rC1', 'conv-C', '/p/c', 'c', 1500000, 'user',
   'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   NULL, NULL, 'uC1', NULL, 'claude', 0),
  ('rC2', 'conv-C', '/p/c', 'c', 1500010, 'assistant',
   'reply', NULL, NULL, 'aC1', 'uC1', 'claude', 0);
SQL

OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { recentConversations } = globalThis.__multivac_test_exports__;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync("${DB_REC}", { readOnly: true });
const rows = recentConversations(db, { limit: 10, projectFilter: null });
console.log("LEN", rows.length);
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  console.log(i, "sid=" + r.sessionId, "title=" + (r.title === null ? "<null>" : JSON.stringify(r.title)), "tail=" + JSON.stringify((r.snippet || "").slice(0,60)));
}
EOF
2>&1)"
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
DB_EMPTY="$(mktemp -t multivac-empty.XXXXXX.db)"
sqlite3 "$DB_EMPTY" <<'SQL'
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, project_path TEXT NOT NULL,
  project_name TEXT NOT NULL, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
  content TEXT, raw_content TEXT, tool_operations TEXT,
  message_uuid TEXT NOT NULL, parent_uuid TEXT,
  source TEXT NOT NULL DEFAULT 'claude',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE VIRTUAL TABLE messages_fts USING fts5(id UNINDEXED, searchable_text);
SQL
OUT_EMPTY="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { recentConversations } = globalThis.__multivac_test_exports__;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync("${DB_EMPTY}", { readOnly: true });
const rows = recentConversations(db, { limit: 10, projectFilter: null });
console.log("LEN", rows.length);
EOF
2>&1)"
case "$OUT_EMPTY" in
  *"LEN 0"*)            PASS=$((PASS+1)); echo "  PASS  T33.empty_returns_empty_array" ;;
  *)                    FAIL=$((FAIL+1)); echo "  FAIL  T33.empty_returns_empty_array — got: $OUT_EMPTY" >&2 ;;
esac
rm -f "$DB_EMPTY"

echo
echo "Test 34: isWrapperContent — unit tests for the wrapper-detection helper"
WRAP_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { isWrapperContent } = globalThis.__multivac_test_exports__;
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
EOF
2>&1)"
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
out_help="$("$MULTIVAC" --help 2>&1)"
assert_contains "T35.help_mentions_flag" "--dangerously-skip-permissions" "$out_help"
assert_contains "T35.help_mentions_alt_enter" "Alt+Enter" "$out_help"

# parseArgs flips the bool
PARSE_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { parseArgs } = globalThis.__multivac_test_exports__;
const on  = parseArgs(["--dangerously-skip-permissions"]);
const off = parseArgs([]);
console.log("on", on.dangerouslySkipPermissions);
console.log("off", off.dangerouslySkipPermissions);
EOF
2>&1)"
case "$PARSE_OUT" in
  *"on true"*"off false"*) PASS=$((PASS+1)); echo "  PASS  T35.parser_branch" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T35.parser_branch — got: $PARSE_OUT" >&2 ;;
esac

echo
echo "Test 36: --dangerously-skip-permissions is silently ignored in one-shot output"
# Force text format so resumeOneLiner shows up (without --format the piped capture defaults to tsv).
out_oneshot="$(MULTIVAC_DB="$DB" "$MULTIVAC" --no-color --format=text --dangerously-skip-permissions 'session timeout' </dev/null 2>&1)"
case "$out_oneshot" in
  *"--dangerously-skip-permissions"*)
                                FAIL=$((FAIL+1)); echo "  FAIL  T36.flag_not_in_oneshot — leaked into output" >&2 ;;
  *"claude --resume conv-aaaa"*)
                                PASS=$((PASS+1)); echo "  PASS  T36.flag_not_in_oneshot" ;;
  *)                            FAIL=$((FAIL+1)); echo "  FAIL  T36.flag_not_in_oneshot — unexpected output: $out_oneshot" >&2 ;;
esac

echo
echo "Test 37: buildClaudeArgs — all action shapes (without + with saved name)"
BCA_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { buildClaudeArgs } = globalThis.__multivac_test_exports__._test;
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
check("dangerous_no_name",       ["--dangerously-skip-permissions","--resume","abc"], buildClaudeArgs("dangerous", row, null));
check("dangerous_with_name",     ["--dangerously-skip-permissions","--name","d","--resume","abc"], buildClaudeArgs("dangerous", row, "d"));
check("remote_no_name",          ["--remote-control","--resume","abc"],            buildClaudeArgs("remote-control", row, null));
check("remote_with_name",        ["--remote-control","rc","--resume","abc"],       buildClaudeArgs("remote-control", row, "rc"));
check("remote_suppresses_name",  true, !buildClaudeArgs("remote-control", row, "x").includes("--name"));
check("empty_name_treated_null", ["--resume","abc"],                               buildClaudeArgs("resume", row, ""));
EOF
2>&1)"
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
TMPCFG="$(mktemp -d -t multivac-cfg.XXXXXX)"
SES_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { loadSessionStore, saveSessionStore, emptySessionStore } = globalThis.__multivac_test_exports__;
const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
const p = "${TMPCFG}/sessions.json";
// load on missing file
let s = loadSessionStore(p);
console.log("EMPTY", s.version, Object.keys(s.names).length, s.pins.length);
// round-trip — keys must be source-prefixed (source:sessionId format)
s.names["claude:conv-a"] = "alpha"; s.names["claude:conv-b"] = "beta"; s.pins.push("claude:conv-a");
saveSessionStore(s, p);
console.log("EXISTS", existsSync(p) ? "yes" : "no");
console.log("NO_TMP", existsSync(p + ".tmp") ? "yes" : "no");
const reloaded = loadSessionStore(p);
console.log("RELOADED", reloaded.names["claude:conv-a"], reloaded.names["claude:conv-b"], reloaded.pins[0]);
// corrupt-file recovery
writeFileSync(p, "{not valid");
const rec = loadSessionStore(p);
console.log("RECOVERED", rec.version, Object.keys(rec.names).length, rec.pins.length);
// type-defensive: non-string name values must be filtered; use source-prefixed keys
writeFileSync(p, JSON.stringify({ version: 1, names: { "claude:a": "ok", "claude:b": 42, "claude:c": "" }, pins: ["claude:x", null] }));
const filt = loadSessionStore(p);
console.log("FILTERED", filt.names["claude:a"], filt.names["claude:b"], filt.names["claude:c"], filt.pins.join(","));
EOF
2>&1)"
case "$SES_OUT" in
  *"EMPTY 1 0 0"*"EXISTS yes"*"NO_TMP no"*"RELOADED alpha beta claude:conv-a"*"RECOVERED 1 0 0"*"FILTERED ok undefined undefined claude:x"*)
    PASS=$((PASS+1)); echo "  PASS  T38.sessions_json_round_trip" ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T38.sessions_json_round_trip — got:" >&2
    echo "$SES_OUT" | sed 's/^/         /' >&2 ;;
esac
rm -rf "$TMPCFG"

echo
echo "Test 39: --print-names — empty config + populated config"
TMPCFG="$(mktemp -d -t multivac-cfg.XXXXXX)"
PN_EMPTY="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --print-names 2>&1)"
assert_eq "T39.empty_prints_braces" "{}" "$PN_EMPTY"
mkdir -p "$TMPCFG/krmrn42-skills/chat-search"
echo '{"version":1,"names":{"conv-xyz":"named one"},"pins":[]}' > "$TMPCFG/krmrn42-skills/chat-search/sessions.json"
PN_FULL="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --print-names 2>&1)"
assert_contains "T39.populated_prints_content" "named one" "$PN_FULL"
assert_contains "T39.populated_prints_session_id" "conv-xyz" "$PN_FULL"
# --print-names short-circuits before any DB work — should succeed even without
# a usable index. Use a non-existent --db-path to confirm.
PN_NODB="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --db-path "/nonexistent/path.db" --print-names 2>&1)"
assert_contains "T39.short_circuits_before_db" "named one" "$PN_NODB"
rm -rf "$TMPCFG"

echo
echo "Test 40: recentConversations — saved-name overlay overrides synthesized title"
RC_NAME_OUT="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { recentConversations } = globalThis.__multivac_test_exports__;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync("${DB}", { readOnly: true });
// Names are keyed as "source:sessionId" (e.g. "claude:conv-aaaa-...").
const store = { version: 1, names: { "claude:conv-aaaa-1111-1111-1111-111111111111": "my custom name" }, pins: [] };
const rows = recentConversations(db, { limit: 10, projectFilter: null, sessionStore: store });
const named = rows.find(r => r.sessionId === "conv-aaaa-1111-1111-1111-111111111111");
const other = rows.find(r => r.sessionId !== "conv-aaaa-1111-1111-1111-111111111111");
console.log("NAMED", named ? named.title : "missing");
console.log("OTHER_NOT_OVERRIDDEN", other && other.title && other.title !== "my custom name" ? "yes" : "no");
// Without the store, synthesized title runs (regression check)
const rowsNoStore = recentConversations(db, { limit: 10, projectFilter: null });
const sameRow = rowsNoStore.find(r => r.sessionId === "conv-aaaa-1111-1111-1111-111111111111");
console.log("NO_STORE_SYNTHESIZED", sameRow && sameRow.title && sameRow.title !== "my custom name" ? "yes" : "no");
EOF
2>&1)"
case "$RC_NAME_OUT" in
  *"NAMED my custom name"*"OTHER_NOT_OVERRIDDEN yes"*"NO_STORE_SYNTHESIZED yes"*)
    PASS=$((PASS+1)); echo "  PASS  T40.recent_conv_name_overlay" ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T40.recent_conv_name_overlay — got:" >&2
    echo "$RC_NAME_OUT" | sed 's/^/         /' >&2 ;;
esac

echo
echo "Test 45: sanitizeTmuxName + shellSingleQuote — pure helpers"
TMX_OUT="$(MULTIVAC="$MULTIVAC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { sanitizeTmuxName, shellSingleQuote } = globalThis.__multivac_test_exports__._test;
function check(label, expected, actual) {
  if (expected === actual) console.log("OK", label);
  else { console.log("FAIL", label, "expected", JSON.stringify(expected), "got", JSON.stringify(actual)); process.exitCode = 1; }
}
check("empty_to_claude",   "claude", sanitizeTmuxName(""));
check("null_to_claude",    "claude", sanitizeTmuxName(null));
check("undef_to_claude",   "claude", sanitizeTmuxName(undefined));
check("ascii_pass",        "foo bar", sanitizeTmuxName("foo bar"));
check("strip_bel",         "foobar", sanitizeTmuxName("foo\x07bar"));
check("strip_null",        "foobar", sanitizeTmuxName("foo\x00bar"));
check("strip_del",         "foobar", sanitizeTmuxName("foo\x7fbar"));
check("truncate_long",     "a".repeat(39) + "…", sanitizeTmuxName("a".repeat(50)));
check("exactly_40_ok",     "a".repeat(40), sanitizeTmuxName("a".repeat(40)));
check("strip_then_empty",  "claude", sanitizeTmuxName("\x01\x02\x03"));
// shellSingleQuote
check("sq_plain",          "'foo'", shellSingleQuote("foo"));
check("sq_with_space",     "'hello world'", shellSingleQuote("hello world"));
check("sq_with_sq",        "'foo'\\''bar'", shellSingleQuote("foo'bar"));
JSEOF
2>&1)"
if echo "$TMX_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T45.tmux_helpers"
  echo "$TMX_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T45.tmux_helpers ($(echo "$TMX_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 46: buildTmuxNewWindowCommand — name resolution + cwd + inner command"
BTW_OUT="$(MULTIVAC="$MULTIVAC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { buildTmuxNewWindowCommand } = globalThis.__multivac_test_exports__._test;
function check(label, expected, actual) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log("OK", label);
  else { console.log("FAIL", label, "expected", e, "got", a); process.exitCode = 1; }
}
const row1 = { sessionId: "abc", projectPath: "/p/alpha", projectName: "alpha" };
check("saved_name_wins", ["new-window","-n","my chat","-c","/p/alpha","'claude' '--name' 'my chat' '--resume' 'abc'"],
  buildTmuxNewWindowCommand(row1, { savedName: "my chat" }));
check("no_name_projectName", ["new-window","-n","alpha","-c","/p/alpha","'claude' '--resume' 'abc'"],
  buildTmuxNewWindowCommand(row1, { savedName: null }));
check("no_projectName_basename", ["new-window","-n","beta","-c","/p/beta","'claude' '--resume' 'xyz'"],
  buildTmuxNewWindowCommand({ sessionId: "xyz", projectPath: "/p/beta" }, { savedName: null }));
check("no_path_fallback_claude", ["new-window","-n","claude","-c",process.cwd(),"'claude' '--resume' 'qqq'"],
  buildTmuxNewWindowCommand({ sessionId: "qqq" }, { savedName: null }));
check("long_name_truncated", "a".repeat(39) + "…",
  buildTmuxNewWindowCommand(row1, { savedName: "a".repeat(50) })[2]);
check("control_name_stripped", "clean",
  buildTmuxNewWindowCommand(row1, { savedName: "clean\x07\x00" })[2]);
JSEOF
2>&1)"
if echo "$BTW_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T46.buildTmuxNewWindowCommand"
  echo "$BTW_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T46.buildTmuxNewWindowCommand ($(echo "$BTW_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 47: --no-tmux parses + --help mentions Ctrl-W when relevant"
nt_out="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { parseArgs } = globalThis.__multivac_test_exports__;
const on = parseArgs(["--no-tmux"]);
const off = parseArgs([]);
console.log("on", on.noTmux);
console.log("off", off.noTmux);
EOF
2>&1)"
case "$nt_out" in
  *"on true"*"off false"*) PASS=$((PASS+1)); echo "  PASS  T47.parser_branch" ;;
  *)                       FAIL=$((FAIL+1)); echo "  FAIL  T47.parser_branch — got: $nt_out" >&2 ;;
esac
help_for_nt="$("$MULTIVAC" --help 2>&1)"
assert_contains "T47.help_mentions_no_tmux" "--no-tmux" "$help_for_nt"

echo
echo "Test 44: --help mentions all new picker keybindings (Ctrl-R/P/T)"
help_out="$("$MULTIVAC" --help 2>&1)"
assert_contains "T44.help_mentions_ctrl_r" "Ctrl-R" "$help_out"
assert_contains "T44.help_mentions_ctrl_p" "Ctrl-P" "$help_out"
assert_contains "T44.help_mentions_ctrl_t" "Ctrl-T" "$help_out"
assert_contains "T44.help_mentions_remote_control" "remote-control" "$help_out"

echo
echo "Test 51: tmuxAvailable gate — args.noTmux suppresses regardless of \$TMUX"
# The gate logic in main() is: !!process.env.TMUX && !args.noTmux. We
# replicate it here against parseArgs output so the contract holds even
# if the inline expression is refactored.
GATE_OUT="$(MULTIVAC_TEST=1 TMUX="/tmp/fake,1,0" node --input-type=module <<EOF
await import("${MULTIVAC}");
const { parseArgs } = globalThis.__multivac_test_exports__;
function gate(args) { return !!process.env.TMUX && !args.noTmux; }
console.log("default", gate(parseArgs([])));
console.log("no_tmux", gate(parseArgs(["--no-tmux"])));
EOF
2>&1)"
case "$GATE_OUT" in
  *"default true"*"no_tmux false"*) PASS=$((PASS+1)); echo "  PASS  T51.gate_inside_tmux_with_no_tmux" ;;
  *)                                FAIL=$((FAIL+1)); echo "  FAIL  T51.gate_inside_tmux_with_no_tmux — got: $GATE_OUT" >&2 ;;
esac
GATE_OUT2="$(MULTIVAC_TEST=1 node --input-type=module <<EOF
await import("${MULTIVAC}");
const { parseArgs } = globalThis.__multivac_test_exports__;
function gate(args) { return !!process.env.TMUX && !args.noTmux; }
delete process.env.TMUX;
console.log("default", gate(parseArgs([])));
console.log("no_tmux", gate(parseArgs(["--no-tmux"])));
EOF
2>&1)"
case "$GATE_OUT2" in
  *"default false"*"no_tmux false"*) PASS=$((PASS+1)); echo "  PASS  T51.gate_outside_tmux" ;;
  *)                                  FAIL=$((FAIL+1)); echo "  FAIL  T51.gate_outside_tmux — got: $GATE_OUT2" >&2 ;;
esac

echo
echo "Test 52: ftsSearch unit — applyPinOrdering invoked on args.sessionStore"
# Calling ftsSearch directly requires MULTIVAC_TEST exports, which doesn'\''t
# currently include ftsSearch. Instead: verify the *contract* via the
# recentConversations + ftsSearch sharing of applyPinOrdering. The proof
# is structural: both functions call applyPinOrdering at the end. We
# assert that signature exists in source so a future refactor that removes
# either call is caught.
RC_HAS_PIN=$(grep -c "applyPinOrdering(results, sessionStore" "$MULTIVAC" 2>/dev/null)
FTS_HAS_PIN=$(grep -c "applyPinOrdering(filled, args.sessionStore" "$MULTIVAC" 2>/dev/null)
if [[ "$RC_HAS_PIN" -ge 1 ]] && [[ "$FTS_HAS_PIN" -ge 1 ]]; then
  PASS=$((PASS+1)); echo "  PASS  T52.both_paths_call_applyPinOrdering"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T52.both_paths_call_applyPinOrdering (recentConversations=$RC_HAS_PIN, ftsSearch=$FTS_HAS_PIN)"
fi

echo
echo "Test 53: MANUAL.md structural invariants"
# The MANUAL is plugin-side documentation (the npm package's own README does not
# carry MANUAL-level depth). Resolve from this test's location upwards to the
# repo root, then into the plugin directory.
MAN="$HERE/../../../plugins/chat-search/MANUAL.md"
if [[ ! -f "$MAN" ]]; then
  FAIL=$((FAIL+1)); echo "  FAIL  T53.manual_exists"
else
  PASS=$((PASS+1)); echo "  PASS  T53.manual_exists"
  # Exactly 12 H2 sections, in the spec order. "How it's distributed" was
  # added in 0.6.0 to document the dual marketplace-plugin vs npm-package shape.
  H2_COUNT="$(grep -cE '^## ' "$MAN")"
  assert_eq "T53.exactly_12_h2_sections" "12" "$H2_COUNT"
  # Spec-required section names appear in order.
  EXPECTED_ORDER="Quick start
The picker
Picker actions
Mutation actions
One-shot mode
The slash command
The index
Flag reference
Troubleshooting
How it's distributed
Compatibility
Origins"
  ACTUAL_ORDER="$(grep -E '^## ' "$MAN" | sed 's/^## //')"
  if [[ "$EXPECTED_ORDER" == "$ACTUAL_ORDER" ]]; then
    PASS=$((PASS+1)); echo "  PASS  T53.section_order"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  T53.section_order — got:" >&2
    echo "$ACTUAL_ORDER" | sed 's/^/         /' >&2
  fi
  # Origins links to four foundational archives.
  for ch in add-chat-search-plugin add-chat-search-slash-command chat-search-self-maintained-index chat-search-zero-deps-and-resume-handoff; do
    if grep -q "2026-05-10-$ch" "$MAN"; then
      PASS=$((PASS+1)); echo "  PASS  T53.origins_links_$ch"
    else
      FAIL=$((FAIL+1)); echo "  FAIL  T53.origins_links_$ch — not linked"
    fi
  done
fi

echo
echo "Test 54: README.md links to MANUAL.md within the first 30 lines"
# Assert on the plugin's README (the one that holds the MANUAL.md pointer
# convention). The npm package's README at packages/multivac/README.md links
# to the same MANUAL via a GitHub URL, which is exercised by other means.
RM="$HERE/../../../plugins/chat-search/README.md"
if head -30 "$RM" | grep -q '\./MANUAL\.md'; then
  PASS=$((PASS+1)); echo "  PASS  T54.readme_pointer_present"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T54.readme_pointer_present"
fi

echo
echo "Test 48: buildStatusBar — wrapping, gating, category coloring"
SB_OUT="$(MULTIVAC="$MULTIVAC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { buildStatusBar, BINDINGS } = globalThis.__multivac_test_exports__._test;
function check(label, cond) {
  if (cond) console.log("OK", label);
  else { console.log("FAIL", label); process.exitCode = 1; }
}
// Action-gated bindings (Enter, Alt-Enter, Ctrl-F, Ctrl-W) are only visible
// when getSource returns a source with the relevant action AND a row is provided.
// Provide a full-capability mock source so all bindings can render.
const allActions = ["resume", "fork", "dangerous", "remote-control", "tmux-window"];
const mockSource = { id: "claude", displayName: "Claude", resume: { actions: allActions }, discover: async () => [], parse: async function*(){} };
function makeGetSource() { return (id) => mockSource; }
const mockRow = { source: "claude", sessionId: "abc", projectPath: "/p", projectName: "p", lastActivity: 0, msgCount: 1, snippet: "", score: 0, title: null };

const wide   = buildStatusBar({ dangerouslySkipPermissions: true, tmuxAvailable: true, getSource: makeGetSource() }, mockRow, 1000);
const mid    = buildStatusBar({ dangerouslySkipPermissions: true, tmuxAvailable: true, getSource: makeGetSource() }, mockRow, 60);
const lean   = buildStatusBar({ dangerouslySkipPermissions: false, tmuxAvailable: false, getSource: makeGetSource() }, mockRow, 1000);
const armed  = buildStatusBar({ dangerouslySkipPermissions: true, tmuxAvailable: false, getSource: makeGetSource() }, mockRow, 1000);
const tmuxed = buildStatusBar({ dangerouslySkipPermissions: false, tmuxAvailable: true, getSource: makeGetSource() }, mockRow, 1000);
// Visibility gating
check("wide_has_alt",    wide.join(" ").includes("Alt-Enter"));
check("wide_has_ctrlw",  wide.join(" ").includes("Ctrl-W"));
check("lean_no_alt",     !lean.join(" ").includes("Alt-Enter"));
check("lean_no_ctrlw",   !lean.join(" ").includes("Ctrl-W"));
check("armed_has_alt",   armed.join(" ").includes("Alt-Enter"));
check("armed_no_ctrlw",  !armed.join(" ").includes("Ctrl-W"));
check("tmuxed_has_ctrlw", tmuxed.join(" ").includes("Ctrl-W"));
check("tmuxed_no_alt",   !tmuxed.join(" ").includes("Alt-Enter"));
// Always-present (with a row that has resume action)
check("has_enter",       wide.join(" ").includes("Enter resume"));
check("has_ctrl_f",      wide.join(" ").includes("Ctrl-F"));
check("has_help_marker", wide.join(" ").includes("? help"));
// Wrapping
check("wide_one_line",   lean.length === 1);
check("mid_two_lines",   mid.length === 2);
// Dangerous category present in both wide (all flags) and armed (no tmux).
// The TS buildStatusBar uses React/Ink for coloring — check text, not ANSI.
check("dangerous_in_wide",  wide.join(" ").includes("dangerous") && armed.join(" ").includes("dangerous"));
// Action category bindings present
check("action_in_wide",  wide.join(" ").includes("rename") && wide.join(" ").includes("pin"));
// Navigation wraps to line 2
check("nav_on_line2",    mid.length === 2 && mid[1].includes("nav"));
JSEOF
2>&1)"
if echo "$SB_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T48.buildStatusBar"
  echo "$SB_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T48.buildStatusBar ($(echo "$SB_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 49: drift guard — every BINDINGS keystroke has an onKeypress handler"
# Read App.tsx (the Ink useInput handler) for key patterns — the bundle minifies
# variable names so we check the TS source directly.
APP_SRC="$HERE/../src/tui/App.tsx"
DRIFT_OUT="$(MULTIVAC="$MULTIVAC" APP_SRC="$APP_SRC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { BINDINGS } = globalThis.__multivac_test_exports__._test;
const { readFileSync } = await import("node:fs");
const src = readFileSync(process.env.APP_SRC, "utf8");
// Mapping: BINDINGS key string → source pattern that onKeypress uses.
// The drift guard is one-directional: every BINDINGS keystroke must have
// a corresponding source pattern. The reverse (every source pattern in
// BINDINGS) is intentionally relaxed — internal handlers (Ctrl-C, Ctrl-K,
// Ctrl-J, Ctrl-U, Backspace) are not user-facing actions and don't belong
// in BINDINGS.
// Ink Key object uses boolean props (key.return, key.escape) and input string,
// not readline-style key.name === "return".
const PATTERNS = {
  "Enter":       /key\.return/,
  "Esc":         /key\.escape/,
  "Alt-Enter":   /key\.meta.*key\.return|key\.meta \|\| key\.shift/,
  "Shift-Enter": /key\.shift.*key\.return|key\.meta \|\| key\.shift/,
  "Ctrl-F":      /key\.ctrl && input === "f"/,
  "Ctrl-R":      /key\.ctrl && input === "r"/,
  "Ctrl-P":      /key\.ctrl && input === "p"/,
  "Ctrl-T":      /key\.ctrl && input === "t"/,
  "Ctrl-W":      /key\.ctrl && input === "w"/,
  "Ctrl-O":      /key\.ctrl && input === "o"/,
  "Ctrl-D":      /key\.ctrl && input === "d"/,
  "Up/Down":     /key\.upArrow|key\.downArrow/,
  "?":           /input === "\?"/,
};
let ok = true;
for (const b of BINDINGS) {
  for (const k of b.keys) {
    const pat = PATTERNS[k];
    if (!pat) {
      console.log("FAIL unknown_key_pattern", k);
      ok = false;
      continue;
    }
    if (!pat.test(src)) {
      console.log("FAIL no_handler_for", k, "(", b.label, ")");
      ok = false;
    } else {
      console.log("OK", k);
    }
  }
}
if (!ok) process.exitCode = 1;
JSEOF
2>&1)"
if echo "$DRIFT_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T49.BINDINGS_drift_guard"
  echo "$DRIFT_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T49.BINDINGS_drift_guard ($(echo "$DRIFT_OUT" | grep -c '^OK') keys checked)"
fi

echo
echo "Test 41: applyPinOrdering — partition, pin-order, limit, FTS-mode no-inject"
APO_OUT="$(MULTIVAC="$MULTIVAC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { applyPinOrdering } = globalThis.__multivac_test_exports__;
// Rows must have source field; pins are keyed as "source:sessionId".
const rows = [
  { source: "claude", sessionId: "A" }, { source: "claude", sessionId: "B" },
  { source: "claude", sessionId: "C" }, { source: "claude", sessionId: "D" },
];
function check(label, expected, actual) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log("OK", label);
  else { console.log("FAIL", label, "expected", e, "got", a); process.exitCode = 1; }
}
function shape(rows) { return rows.map(r => r.sessionId + (r.isPinned ? "*" : "")); }
check("no_pins",        ["A","B","C","D"],         shape(applyPinOrdering(rows, { pins: [] }, 10)));
check("no_store",       ["A","B","C","D"],         shape(applyPinOrdering(rows, null, 10)));
check("pinned_order",   ["B*","A*","C","D"],       shape(applyPinOrdering(rows, { pins: ["claude:B","claude:A"] }, 10)));
check("limit_caps_total",["A*","B*"],              shape(applyPinOrdering(rows, { pins: ["claude:A","claude:B"] }, 2)));
check("limit_excludes_unpinned",["A*"],            shape(applyPinOrdering(rows, { pins: ["claude:A"] }, 1)));
check("fts_no_inject",  ["C*","A","B","D"],        shape(applyPinOrdering(rows, { pins: ["claude:Z","claude:C"] }, 10)));
check("limit_zero_returns_empty",[],               shape(applyPinOrdering(rows, { pins: ["claude:A"] }, 0)));
JSEOF
2>&1)"
if echo "$APO_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T41.applyPinOrdering"
  echo "$APO_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T41.applyPinOrdering ($(echo "$APO_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "Test 42: recentConversations + pins — partition end-to-end with fixture DB"
PIN_REC_OUT="$(MULTIVAC="$MULTIVAC" DB="$DB" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { recentConversations } = globalThis.__multivac_test_exports__;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(process.env.DB, { readOnly: true });
// Pin the OLDEST conversation (conv-aaaa). Expect: conv-aaaa first (pinned),
// then the rest in recency order. Pins are stored as "source:sessionId".
const store = { version: 1, names: {}, pins: ["claude:conv-aaaa-1111-1111-1111-111111111111"] };
const rows = recentConversations(db, { limit: 10, projectFilter: null, sessionStore: store });
console.log("FIRST_IS_PINNED", rows[0].isPinned, rows[0].sessionId.slice(0, 9));
console.log("REST_NOT_PINNED", rows.slice(1).every(r => !r.isPinned) ? "yes" : "no");
// Without store, no pinning; recent-first order
const rows2 = recentConversations(db, { limit: 10, projectFilter: null });
console.log("NO_STORE_NO_PIN", rows2.every(r => !r.isPinned) ? "yes" : "no");
JSEOF
2>&1)"
case "$PIN_REC_OUT" in
  *"FIRST_IS_PINNED true conv-aaaa"*"REST_NOT_PINNED yes"*"NO_STORE_NO_PIN yes"*)
    PASS=$((PASS+1)); echo "  PASS  T42.recent_pinned_promoted" ;;
  *)
    FAIL=$((FAIL+1)); echo "  FAIL  T42.recent_pinned_promoted — got:" >&2
    echo "$PIN_REC_OUT" | sed 's/^/         /' >&2 ;;
esac

echo
echo "Test 43: --unpin-all clears pins, leaves names alone, exits 0"
TMPCFG="$(mktemp -d -t multivac-cfg.XXXXXX)"
mkdir -p "$TMPCFG/krmrn42-skills/chat-search"
SESFILE="$TMPCFG/krmrn42-skills/chat-search/sessions.json"
echo '{"version":1,"names":{"conv-x":"keep me"},"pins":["a","b","c"]}' > "$SESFILE"
UNPIN_OUT="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --unpin-all 2>&1)"
UNPIN_RC=$?
assert_eq "T43.exit_code" "0" "$UNPIN_RC"
assert_contains "T43.stdout_announces" "cleared 3 pin" "$UNPIN_OUT"
AFTER="$(cat "$SESFILE")"
assert_contains "T43.names_preserved" '"keep me"' "$AFTER"
assert_contains "T43.pins_cleared" '"pins": []' "$AFTER"
# Idempotency: re-run on empty pins
UNPIN2_OUT="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --unpin-all 2>&1)"
assert_contains "T43.idempotent" "cleared 0 pin" "$UNPIN2_OUT"
# Missing file: creates one
rm -f "$SESFILE"
UNPIN3_OUT="$(XDG_CONFIG_HOME="$TMPCFG" "$MULTIVAC" --unpin-all 2>&1)"
UNPIN3_RC=$?
assert_eq "T43.create_when_missing_exit" "0" "$UNPIN3_RC"
if [[ -f "$SESFILE" ]]; then
  PASS=$((PASS+1)); echo "  PASS  T43.create_when_missing_file_exists"
else
  FAIL=$((FAIL+1)); echo "  FAIL  T43.create_when_missing_file_exists" >&2
fi
rm -rf "$TMPCFG"

echo
echo "Test 26: drift guard — every parser flag appears in --help"
# Extract long-form flags from source: lines like `case "--something":`. Strip
# line-comment lines first so `case "--flag":` appearing inside a // comment
# (documenting the convention) doesn't get picked up as a real parser case.
PARSER_FLAGS=$(grep -v -E '^[[:space:]]*//' "$MULTIVAC" \
  | grep -oE 'case "--[a-z][a-z-]+"' \
  | sed -E 's/case "(.*)"/\1/' \
  | sort -u)
# Extract long-form flags from --help output (any --token)
HELP_FLAGS=$("$MULTIVAC" --help 2>/dev/null | grep -oE -- '--[a-z][a-z-]+' | sort -u)
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
echo "Test 55: init subcommand — fallback when claude is absent"
# Strip claude from PATH (use a minimal PATH without any user-local bin dirs).
init_out="$(PATH=/usr/bin:/bin "$MULTIVAC" init 2>&1)"
init_code="$(PATH=/usr/bin:/bin "$MULTIVAC" init >/dev/null 2>&1; echo $?)"
assert_eq            "T55.exit_0"              "0"                          "$init_code"
assert_contains      "T55.mentions_claude"     "claude"                     "$init_out"
assert_contains      "T55.shows_marketplace"   "/plugin marketplace add"    "$init_out"
assert_contains      "T55.shows_install"       "/plugin install"            "$init_out"
assert_not_contains  "T55.no_ccsearch_literal" "ccsearch"                   "$init_out"

echo
echo 'Test 56: -- literal-query escape — `multivac -- init` searches for the word "init"'
# Routing must NOT dispatch the init subcommand here; instead, the CLI should
# attempt a real query against the DB. We point at a non-existent DB so the
# search fails with the env-error exit code (2), which itself proves the
# query path ran (init dispatch would have returned exit 0 via the fallback).
lit_code="$(MULTIVAC_DB=/nonexistent/no.db "$MULTIVAC" -- init >/dev/null 2>&1; echo $?)"
assert_eq  "T56.exit_2_env_error"  "2"  "$lit_code"

echo
echo "Test 57: init --no-such-flag exits 1 (parser rejects the unknown flag before dispatch)"
bad_code="$(PATH=/usr/bin:/bin "$MULTIVAC" init --no-such-flag >/dev/null 2>&1; echo $?)"
assert_eq  "T57.exit_1_user_error"  "1"  "$bad_code"

echo
echo "Test 59: init invokes 'claude plugin marketplace add' + 'claude plugin install' (NOT slash-command form)"
# Set up a shim claude that logs argv to a file and exits 0. This proves the
# argv shape is correct without mutating any real Claude Code marketplace state.
SHIM_DIR="$(mktemp -d -t multivac-claudeshim.XXXXXX)"
cat > "$SHIM_DIR/claude" <<'SHIM_EOF'
#!/bin/bash
# Capture all argv for assertion; print a benign success line.
printf 'SHIM-CALL:'; for a in "$@"; do printf ' %s' "$a"; done; printf '\n'
exit 0
SHIM_EOF
chmod +x "$SHIM_DIR/claude"
shim_out="$(PATH="$SHIM_DIR:/usr/bin:/bin" "$MULTIVAC" init 2>&1)"
shim_code="$(PATH="$SHIM_DIR:/usr/bin:/bin" "$MULTIVAC" init >/dev/null 2>&1; echo $?)"
assert_eq            "T59.exit_0"                        "0"                                                                       "$shim_code"
assert_contains      "T59.marketplace_argv"              "SHIM-CALL: plugin marketplace add krmrn42/krmrn-skills"                  "$shim_out"
assert_contains      "T59.install_argv"                  "SHIM-CALL: plugin install chat-search@krmrn-skills"                      "$shim_out"
assert_not_contains  "T59.no_slash_form"                 "/plugin marketplace add"                                                 "$shim_out"
assert_not_contains  "T59.no_slash_form_install"         "/plugin install"                                                         "$shim_out"
rm -rf "$SHIM_DIR"

echo
echo "Test 58: detectAlreadyConfigured — heuristic match on 'already' keyword"
DAC_OUT="$(MULTIVAC="$MULTIVAC" MULTIVAC_TEST=1 node --input-type=module <<'JSEOF'
await import(process.env.MULTIVAC);
const { detectAlreadyConfigured } = globalThis.__multivac_test_exports__;
function check(label, expected, actual) {
  if (expected === actual) console.log("OK", label);
  else { console.log("FAIL", label, "expected", expected, "got", actual); process.exitCode = 1; }
}
// TS detectAlreadyConfigured takes a single combined string (not an object).
check("empty_result",         false, detectAlreadyConfigured(""));
check("plain_failure",        false, detectAlreadyConfigured("plugin install failed: 500 internal"));
check("already_installed",    true,  detectAlreadyConfigured("plugin chat-search is already installed"));
check("already_added",        true,  detectAlreadyConfigured("marketplace already added"));
check("already_exists",       true,  detectAlreadyConfigured("already exists"));
check("case_insensitive",     true,  detectAlreadyConfigured("MARKETPLACE ALREADY ADDED"));
check("word_boundary_strict", false, detectAlreadyConfigured("alreadyEnabled missing word boundary"));
check("null_safe",            false, detectAlreadyConfigured(""));
JSEOF
2>&1)"
if echo "$DAC_OUT" | grep -q '^FAIL'; then
  FAIL=$((FAIL+1))
  echo "  FAIL  T58.detectAlreadyConfigured"
  echo "$DAC_OUT" | sed 's/^/         /'
else
  PASS=$((PASS+1))
  echo "  PASS  T58.detectAlreadyConfigured ($(echo "$DAC_OUT" | grep -c '^OK') cases ok)"
fi

echo
echo "----------------------------------------"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "----------------------------------------"

[[ "$FAIL" == "0" ]]
