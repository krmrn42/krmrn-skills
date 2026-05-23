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
