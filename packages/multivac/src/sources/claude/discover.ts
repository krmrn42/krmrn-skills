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

// Re-export discover as listJsonlFiles for the indexer status reporter.
export { discover as listJsonlFiles };
