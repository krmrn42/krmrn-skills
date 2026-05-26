import type { DatabaseSync } from "node:sqlite";
import { basename } from "node:path";
import type { ChatSource, SourceFile } from "../sources/types.js";
import { getRegistry } from "../sources/registry.js";
import { ensureSchema, getState, setState } from "./state.js";

export interface RunIndexerOpts {
  silent?: boolean;
}

export interface IndexerCounters {
  total: number;
  added: number;
  unchanged: number;
  skipped: number;
}

export async function runIndexer(db: DatabaseSync, opts: RunIndexerOpts = {}): Promise<IndexerCounters> {
  ensureSchema(db);
  const counters: IndexerCounters = { total: 0, added: 0, unchanged: 0, skipped: 0 };
  for (const source of getRegistry()) {
    await indexSource(db, source, counters, opts);
  }
  return counters;
}

async function indexSource(
  db: DatabaseSync,
  source: ChatSource,
  counters: IndexerCounters,
  opts: RunIndexerOpts
): Promise<void> {
  const files = await source.discover();

  // Sweep _indexer_state for jsonl files that have disappeared since the last
  // run (e.g. a `~/.claude/projects/*/*.jsonl` was deleted). Drop their
  // messages_fts/messages rows and their state row so they don't linger in the
  // index. Matches v0.6.0 indexer behavior at indexer.js:328-340.
  const discovered = new Set(files.map((f) => f.path));
  const stateRows = db
    .prepare("SELECT jsonl_path FROM _indexer_state WHERE source = ?")
    .all(source.id) as Array<{ jsonl_path: string }>;
  for (const r of stateRows) {
    if (discovered.has(r.jsonl_path)) continue;
    const sid = basename(r.jsonl_path, ".jsonl");
    db.prepare("DELETE FROM messages WHERE source = ? AND conversation_id = ?").run(source.id, sid);
    db.prepare("DELETE FROM _indexer_state WHERE source = ? AND jsonl_path = ?").run(source.id, r.jsonl_path);
  }

  for (const file of files) {
    counters.total += 1;
    const state = getState(db, source.id, file.path);
    if (state && state.mtimeMs >= file.mtimeMs) {
      counters.unchanged += 1;
      continue;
    }
    try {
      const rows = await indexFile(db, source, file);
      counters.added += rows;
      setState(db, source.id, file.path, file.mtimeMs, rows);
    } catch (e: unknown) {
      if (!opts.silent) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`multivac: indexer failed on ${file.path}: ${msg}\n`);
      }
      counters.skipped += 1;
    }
  }
}

async function indexFile(db: DatabaseSync, source: ChatSource, file: SourceFile): Promise<number> {
  // Derive the conversation id from the JSONL filename (basename without .jsonl).
  // This matches the JS indexer's approach.
  const conversationId = basename(file.path, ".jsonl");

  // Delete all existing messages for this conversation from this source.
  db.prepare(
    "DELETE FROM messages WHERE source = ? AND conversation_id = ?"
  ).run(source.id, conversationId);

  const insert = db.prepare(
    "INSERT INTO messages (id, conversation_id, project_path, project_name, " +
      "timestamp, type, content, message_uuid, parent_uuid, source, " +
      "subtype, git_branch, attribution_skill, is_subagent, entrypoint) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  // Track per-(conversationId, messageUuid) block indices to produce unique IDs
  // when a single parsed record yields multiple rows (e.g. multi-block assistant messages).
  const blockCounters = new Map<string, number>();

  let rows = 0;

  try {
    db["exec"]("BEGIN");
    for await (const row of source.parse(file)) {
      const key = `${row.conversationId}:${row.messageUuid}`;
      const blockIdx = blockCounters.get(key) ?? 0;
      blockCounters.set(key, blockIdx + 1);
      const id = `${source.id}:${row.conversationId}:${row.messageUuid}:${blockIdx}`;
      try {
        insert.run(
          id,
          row.conversationId,
          row.projectPath,
          row.projectName,
          row.timestamp,
          row.type,
          row.content,
          row.messageUuid,
          row.parentUuid,
          source.id,
          row.subtype ?? null,
          row.gitBranch ?? null,
          row.attributionSkill ?? null,
          row.isSubagent ? 1 : 0,
          row.entrypoint ?? null
        );
        rows++;
      } catch (_) {
        // duplicate or constraint violation — skip
      }
    }
    db["exec"]("COMMIT");
  } catch (e) {
    try { db["exec"]("ROLLBACK"); } catch (_) { /* ignore */ }
    throw e;
  }

  return rows;
}

export async function fullReindex(db: DatabaseSync, opts: RunIndexerOpts = {}): Promise<IndexerCounters> {
  ensureSchema(db);
  db["exec"]("DELETE FROM _indexer_state; DELETE FROM messages_fts; DELETE FROM messages;");
  return runIndexer(db, opts);
}
