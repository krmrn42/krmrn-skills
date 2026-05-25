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
