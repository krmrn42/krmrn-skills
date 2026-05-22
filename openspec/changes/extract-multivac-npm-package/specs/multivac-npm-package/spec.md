## ADDED Requirements

### Requirement: Package identity and registry metadata

The published artifact SHALL be the scoped npm package `@krmrn42/multivac`, declared in `packages/multivac/package.json`. The package metadata MUST include `name`, `version`, `description`, `license` (`MIT`), `author`, `repository` (pointing to this monorepo with a `directory: "packages/multivac"` field), `bugs.url`, and `homepage` fields. The `version` field MUST equal the `version` field in `plugins/chat-search/.claude-plugin/plugin.json` and the matching `marketplace.json` plugin entry — a version skew across these three files is a release-blocking error.

#### Scenario: Package name is scoped

- **WHEN** the package is published
- **THEN** the resolved name in the npm registry is `@krmrn42/multivac`
- **AND** the `package.json` `name` field is the literal string `"@krmrn42/multivac"`

#### Scenario: Version-sync invariant

- **WHEN** the repository's lint or release tooling runs
- **THEN** it MUST verify that `packages/multivac/package.json` `version` equals `plugins/chat-search/.claude-plugin/plugin.json` `version`
- **AND** equals the `version` of the `chat-search` entry in `.claude-plugin/marketplace.json`
- **AND** any inequality fails the lint/release step with a message naming all three files and their values

#### Scenario: Repository and homepage point to monorepo

- **WHEN** a user runs `npm info @krmrn42/multivac`
- **THEN** the printed `repository.url` resolves to `https://github.com/krmrn42/krmrn-skills`
- **AND** the `repository.directory` is `packages/multivac`
- **AND** the `homepage` field references the same repository and points the reader at the package's location

### Requirement: Single bin name `multivac`

The package SHALL expose exactly one CLI entry point via the `bin` field — the name `multivac` — resolving to the canonical JavaScript module under `packages/multivac/src/multivac.js`. The script MUST start with the `#!/usr/bin/env node` shebang and MUST be marked executable in the published tarball. The name `ccsearch` SHALL NOT appear as a bin alias.

#### Scenario: Bin map declares only multivac

- **WHEN** the package is published
- **THEN** `package.json#bin` is either an object with exactly one key `multivac` mapping to `src/multivac.js`, or the shorthand string form `"src/multivac.js"` paired with `"name": "@krmrn42/multivac"` (which npm interprets as bin `multivac`)
- **AND** no key, value, or alias named `ccsearch` is present in `package.json#bin`

#### Scenario: `multivac` is on PATH after global install

- **WHEN** a user runs `npm install -g @krmrn42/multivac` on a machine with Node 22.5+ and the npm-global bin directory on `$PATH`
- **THEN** `command -v multivac` returns a path inside the npm-global bin directory
- **AND** `command -v ccsearch` returns nothing (the package does not register a `ccsearch` bin)

### Requirement: Zero runtime dependencies

The package SHALL declare no entries in `dependencies` or `peerDependencies`. The published tarball MUST run using only Node.js built-ins, including `node:sqlite` from Node 22.5+.

#### Scenario: No transitive deps in install

- **WHEN** a user runs `npm install -g @krmrn42/multivac` in a clean directory
- **THEN** the npm install log reports `added 1 package` (the package itself, no transitive installs)
- **AND** no `node_modules` subtree is created under the installed package directory

#### Scenario: package.json has empty dep blocks

- **WHEN** inspecting `packages/multivac/package.json`
- **THEN** either the `dependencies` and `peerDependencies` fields are absent
- **OR** if present, both fields are empty objects `{}`

### Requirement: Node engine constraint

The package SHALL declare `engines.node` >= `22.5.0` in `package.json`, matching the runtime check the CLI already performs. The CLI's existing runtime version check MUST remain in place as a defense in depth so users on older Node receive a clear, actionable error rather than an opaque `node:sqlite` import failure.

#### Scenario: Engine declared in package.json

- **WHEN** inspecting `packages/multivac/package.json`
- **THEN** `engines.node` is the string `">=22.5.0"`

#### Scenario: Runtime check survives on older Node

- **WHEN** a user with Node 22.4 or older runs `npx @krmrn42/multivac`
- **THEN** the CLI prints an environment error naming the required Node version (per existing `dieEnv` behavior)
- **AND** exits with code 2

### Requirement: One-shot `npx` invocation works without prior install

The package SHALL be runnable via `npx @krmrn42/multivac <query>` without a prior `npm install`. The first such invocation MAY take longer due to npm's download step, but subsequent ones MUST reuse npx's cache.

#### Scenario: npx runs the search without install

- **WHEN** a user with Node 22.5+ runs `npx -y @krmrn42/multivac --help` on a machine that has never installed the package
- **THEN** stdout contains the CLI's help text
- **AND** the exit code is 0
- **AND** no global or project-local `node_modules` directory is created

#### Scenario: `multivac init` is invokable via npx

- **WHEN** a user runs `npx -y @krmrn42/multivac init`
- **THEN** the init subcommand executes (see `multivac-init-command` capability)

### Requirement: Files allowlist limits tarball contents

The package SHALL declare a `files` field in `package.json` that explicitly enumerates the directories and files shipped in the tarball: the CLI sources under `src/`, the `LICENSE`, and the `README.md`. Test files, lint configs, OpenSpec artifacts, `NAMING.md`, and `.test.sh` files MUST NOT ship in the tarball.

#### Scenario: Test script is excluded

- **WHEN** the package is packed with `npm pack` and the tarball is inspected
- **THEN** the tarball does NOT contain any file whose name ends in `.test.sh` or any file under a `test/` directory

#### Scenario: NAMING.md is repo-internal

- **WHEN** the package is packed with `npm pack`
- **THEN** the tarball does NOT contain `NAMING.md` (it lives at `packages/multivac/NAMING.md` for repo readers, not npm consumers)

#### Scenario: README and LICENSE are included

- **WHEN** the package is packed with `npm pack`
- **THEN** the tarball contains `README.md` and `LICENSE` at the package root

### Requirement: CLI sources are self-contained inside the package

The CLI's JavaScript sources SHALL live entirely under `packages/multivac/src/`. The script MUST NOT `require`/`import` any file outside `packages/multivac/`. Relative imports between the CLI's modules (`indexer.js`, `picker.js`, and the renamed `multivac.js` entrypoint) MUST resolve within `packages/multivac/src/`.

#### Scenario: No cross-package imports

- **WHEN** static analysis (`grep -RE "require\\(.*(\\.\\./){2,}\"`) is run over `packages/multivac/src/`
- **THEN** no match is found that escapes the package root

#### Scenario: Sources are runnable from the package root

- **WHEN** a developer runs `node packages/multivac/src/multivac.js --help` from the repository root
- **THEN** the help text is printed
- **AND** the exit code is 0
