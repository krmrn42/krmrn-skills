/**
 * Box-drawing character sets. ROUNDED is the default for color-capable
 * terminals; ASCII degrades gracefully for `--no-color` / `NO_COLOR` /
 * `TERM=dumb`. Spec: §D11.
 */
export interface BoxChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

export const ROUNDED: BoxChars = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
};

export const ASCII: BoxChars = {
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  horizontal: "-",
  vertical: "|",
};

export function pickBox(noColor: boolean): BoxChars {
  return noColor ? ASCII : ROUNDED;
}
