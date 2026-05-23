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
