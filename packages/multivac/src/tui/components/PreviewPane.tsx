import React from "react";
import { Box, Text } from "ink";
import { wrapToWidth } from "../lib/width.js";

interface Props {
  previewText: string;
  width: number;
  maxRows: number;
}

export function PreviewPane({ previewText, width, maxRows }: Props) {
  // Hard-clip to maxRows so the preview never overflows the terminal body
  // (matches v0.6.0 picker.js behavior: pLine <= bodyBottom).
  const wrapped = previewText
    .split("\n")
    .flatMap((l) => wrapToWidth(l, Math.max(1, width - 2)));
  const lines = wrapped.slice(0, Math.max(0, maxRows));
  return (
    <Box flexDirection="column" width={width} height={maxRows}>
      {lines.map((line, i) => (
        <Text key={i}>
          <Text dimColor>│ </Text>
          {line}
        </Text>
      ))}
    </Box>
  );
}
