// src/sources/claude/index.ts — stub, fleshed out in a later task.
import type { ChatSource } from "../types.js";

const claudeSource: ChatSource = {
  id: "claude",
  displayName: "Claude Code",
  async discover() { return []; },
  async *parse() { /* stub */ },
};

export default claudeSource;
