import React from "react";
import { Box, Text } from "ink";
import { wrapToWidth } from "../lib/width.js";
import { pickBox } from "../lib/box.js";

interface Props {
  previewText: string;
  width: number;
  maxRows: number;
  noColor?: boolean;
}

export function PreviewPane({ previewText, width, maxRows, noColor = false }: Props) {
  const box = pickBox(noColor);
  const horiz = box.horizontal.repeat(Math.max(0, width - 2));
  const top = box.topLeft + horiz + box.topRight;
  const bottom = box.bottomLeft + horiz + box.bottomRight;

  const wrapped = previewText
    .split("\n")
    .flatMap((l) => wrapToWidth(l, Math.max(1, width - 2)));
  const bodyRows = Math.max(0, maxRows - 2);
  const lines = wrapped.slice(0, bodyRows);

  return (
    <Box flexDirection="column" width={width} height={maxRows}>
      <Text dimColor>{top}</Text>
      {lines.map((line, i) => (
        <Text key={i}>
          <Text dimColor>{box.vertical} </Text>
          {line}
        </Text>
      ))}
      {Array.from({ length: Math.max(0, bodyRows - lines.length) }).map((_, i) => (
        <Text key={"pad-" + i}> </Text>
      ))}
      <Text dimColor>{bottom}</Text>
    </Box>
  );
}
