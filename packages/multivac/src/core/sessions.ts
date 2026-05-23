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
