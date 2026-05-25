import React from "react";
import { Box, Text } from "ink";
import type { PickerMode } from "../state/actions.js";

interface Props {
  mode: PickerMode;
  query: string;
  renameBuffer: string;
  searchPending: boolean;
}

export function PromptLine({ mode, query, renameBuffer, searchPending }: Props) {
  if (mode === "rename") {
    return (
      <Box>
        <Text color="cyan">rename&gt; </Text>
        <Text>{renameBuffer}</Text>
        <Text inverse> </Text>
      </Box>
    );
  }
  if (mode === "help") {
    return (
      <Box>
        <Text color="cyan">help&gt; </Text>
        <Text dimColor>press any key to dismiss</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="cyan">ccsearch&gt; </Text>
      <Text>{query}</Text>
      {searchPending ? <Text dimColor> …</Text> : null}
    </Box>
  );
}
