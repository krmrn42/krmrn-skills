import React from "react";
import { Box, Text } from "ink";
import { BINDINGS, type Binding } from "../state/keybindings.js";

const CATEGORY_COLORS: Record<Binding["category"], string> = {
  resume: "green",
  action: "cyan",
  dangerous: "red",
  navigation: "white",
};

export function HelpOverlay() {
  return (
    <Box flexDirection="column">
      <Text bold>Keybindings</Text>
      <Text> </Text>
      {BINDINGS.map((b, i) => (
        <Box key={i}>
          <Box width={20}>
            <Text color={CATEGORY_COLORS[b.category]}>{b.keys.join(" / ")}</Text>
          </Box>
          <Box width={16}>
            <Text>{b.label}</Text>
          </Box>
          <Text dimColor>{b.longHelp}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text dimColor>(press any key to return)</Text>
    </Box>
  );
}
