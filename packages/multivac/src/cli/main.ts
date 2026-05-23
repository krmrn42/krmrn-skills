// src/cli/main.ts — placeholder, replaced in a later task.
const version = process.env.MULTIVAC_VERSION ?? "0.0.0-dev";

function main(): number {
  process.stdout.write(`multivac scaffold ok (v${version})\n`);
  return 0;
}

process.exit(main());
