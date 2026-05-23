// esbuild.config.mjs — bundles src/cli/main.ts into dist/multivac.js
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// Stub out react-devtools-core so ink's optional DEV-mode devtools don't
// cause a missing-package error at startup. The real module is only needed
// when process.env.DEV === "true" (React Devtools integration), which is not
// a use case for this CLI.
const stubDevtools = {
  name: "stub-react-devtools-core",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
      path: args.path,
      namespace: "stub-ns",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub-ns" }, () => ({
      contents: "export default { connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  platform: "node",
  target: "node22.5",
  format: "esm",
  outfile: "dist/multivac.js",
  banner: {
    // The shebang makes the file directly executable.
    // The require polyfill (createRequire) is needed because some bundled CJS
    // transitive dependencies (e.g. signal-exit inside ink) call require()
    // at runtime; ESM has no built-in require, so we inject one here.
    js: [
      "#!/usr/bin/env node",
      `import { createRequire as __createRequire } from "node:module";`,
      `const require = __createRequire(import.meta.url);`,
    ].join("\n"),
  },
  external: [
    "node:*",
    // CJS modules inside dependencies may require() bare built-in names
    // (without the node: prefix). Marking them external prevents esbuild from
    // trying to bundle them and hitting "Dynamic require not supported" in ESM.
    "assert", "buffer", "child_process", "cluster", "crypto", "dgram",
    "dns", "domain", "events", "fs", "http", "http2", "https", "inspector",
    "module", "net", "os", "path", "perf_hooks", "process", "punycode",
    "querystring", "readline", "repl", "stream", "string_decoder", "timers",
    "tls", "trace_events", "tty", "url", "util", "v8", "vm", "worker_threads",
    "zlib",
  ],
  plugins: [stubDevtools],
  define: {
    "process.env.MULTIVAC_VERSION": JSON.stringify(pkg.version),
  },
  minify: false,
  sourcemap: false,
  legalComments: "inline",
  logLevel: "info",
});
