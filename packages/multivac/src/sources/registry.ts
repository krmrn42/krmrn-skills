import type { ChatSource } from "./types.js";
import type { SourceId } from "../core/types.js";
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
