import React from "react";
import { Box, Text } from "ink";
import { wrapToWidth } from "../lib/width.js";

interface Props {
  previewText: string;
  width: number;
}

export function PreviewPane({ previewText, width }: Props) {
  // Render with a vertical "│ " left margin to separate from list.
  const lines = previewText
    .split("\n")
    .flatMap((l) => wrapToWidth(l, Math.max(1, width - 2)));
  return (
    <Box flexDirection="column" width={width}>
      {lines.map((line, i) => (
        <Text key={i}>
          <Text dimColor>│ </Text>
          {line}
        </Text>
      ))}
    </Box>
  );
}
