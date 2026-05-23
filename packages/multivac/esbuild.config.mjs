// esbuild.config.mjs — bundles src/cli/main.ts into dist/multivac.js
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

await build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22.5",
  format: "esm",
  outfile: "dist/multivac.js",
  banner: { js: "#!/usr/bin/env node" },
  external: ["node:*"],
  define: {
    "process.env.MULTIVAC_VERSION": JSON.stringify(pkg.version),
  },
  minify: false,
  sourcemap: false,
  legalComments: "inline",
  logLevel: "info",
});
