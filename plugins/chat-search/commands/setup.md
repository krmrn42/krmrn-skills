---
description: Symlink multivac into a directory on the user's shell PATH so they can run it from any terminal.
argument-hint: "[target-dir]"
---

Configure the `chat-search` plugin for use from the user's own shell (outside Claude Code). Inside Claude Code, `multivac` is already on the `Bash` tool's PATH — this command is only for shell-side use.

## What this command does

1. **Cleans up a stale `ccsearch` symlink** from a prior pre-0.6.0 install, if present (only if the symlink resolves into the plugin's own `bin/` — anything else is left untouched).
2. Symlinks `${CLAUDE_PLUGIN_ROOT}/bin/multivac` into a directory on the user's PATH (default: `~/.local/bin`).
3. Detects whether that directory is on the user's `$PATH` and, if not, prints the appropriate shell-rc export line for the user to add themselves.
4. Idempotent — re-running this command is safe and does not produce errors.

The slash command **does not** auto-modify `~/.zshrc`, `~/.bashrc`, or any other shell-rc file. If a PATH export is needed, the user adds it themselves.

## How to run it

The plugin's `bin/` is on the `Bash` tool's PATH already, but we need the *source path* of `bin/multivac` to symlink from. Use `${CLAUDE_PLUGIN_ROOT}/bin/multivac` as the source path of the symlink — that's the stable path inside the plugin's installed directory.

Default target: `${HOME}/.local/bin`. If `$ARGUMENTS` is non-empty, treat its first token as an override target directory (e.g., `/chat-search:setup ~/bin` → target = `~/bin`). Expand `~` to `${HOME}` yourself when needed; the user expects shell-style behavior.

Run the following bash block via the `Bash` tool, then surface the output to the user verbatim:

```bash
set -u
TARGET_DIR="${ARGUMENTS:-}"
if [ -z "$TARGET_DIR" ]; then
  TARGET_DIR="$HOME/.local/bin"
fi
# Expand leading ~ if the user passed one
case "$TARGET_DIR" in
  "~"|"~/"*) TARGET_DIR="$HOME${TARGET_DIR#\~}" ;;
esac

SRC="${CLAUDE_PLUGIN_ROOT}/bin/multivac"
DEST="$TARGET_DIR/multivac"

if [ ! -x "$SRC" ]; then
  echo "multivac: source not found or not executable: $SRC" >&2
  echo "          this is a plugin install bug — file an issue" >&2
  exit 2
fi

mkdir -p "$TARGET_DIR"

# Stale-symlink cleanup: prior versions of this command (pre-0.6.0) created
# $TARGET_DIR/ccsearch pointing into plugins/chat-search/bin/. The binary has
# been renamed; remove the stale symlink IF it points into our plugin's bin/
# (the only case where we know we created it). Leave untouched if it's a
# regular file or a symlink resolving elsewhere — those are not ours to touch.
LEGACY_CC="$TARGET_DIR/ccsearch"
if [ -L "$LEGACY_CC" ]; then
  legacy_target="$(readlink "$LEGACY_CC" || true)"
  case "$legacy_target" in
    *plugins/chat-search/bin/*)
      unlink "$LEGACY_CC"
      echo "multivac: removed stale \`ccsearch\` symlink from prior install"
      echo "  removed: $LEGACY_CC  ->  $legacy_target"
      ;;
    *)
      echo "multivac: $LEGACY_CC points at $legacy_target (not plugin-owned); leaving in place"
      ;;
  esac
elif [ -e "$LEGACY_CC" ]; then
  echo "multivac: $LEGACY_CC is a regular file (not a symlink); leaving in place"
  echo "          remove manually if it is no longer needed"
fi

# Idempotent symlink: replace any existing entry that points elsewhere.
if [ -L "$DEST" ]; then
  current="$(readlink "$DEST" || true)"
  if [ "$current" = "$SRC" ]; then
    echo "multivac: already configured"
    echo "  link:   $DEST  ->  $SRC"
    already_ok=1
  else
    ln -sf "$SRC" "$DEST"
    echo "multivac: replaced existing symlink"
    echo "  old:    $current"
    echo "  new:    $DEST  ->  $SRC"
  fi
elif [ -e "$DEST" ]; then
  echo "multivac: $DEST exists and is not a symlink; refusing to overwrite." >&2
  echo "          Remove it manually or re-run with a different target dir."  >&2
  exit 1
else
  ln -s "$SRC" "$DEST"
  echo "multivac: linked"
  echo "  link:   $DEST  ->  $SRC"
fi

# PATH check
case ":$PATH:" in
  *":$TARGET_DIR:"*)
    echo "multivac: $TARGET_DIR is on \$PATH — run \`multivac --help\` from any shell"
    ;;
  *)
    echo
    echo "$TARGET_DIR is NOT on your \$PATH."
    SH_BASENAME="$(basename "${SHELL:-/bin/bash}")"
    case "$SH_BASENAME" in
      zsh)
        echo "Add to ~/.zshrc:"
        echo "  echo 'export PATH=\"$TARGET_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
        ;;
      bash)
        echo "Add to ~/.bashrc:"
        echo "  echo 'export PATH=\"$TARGET_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
        ;;
      fish)
        echo "Run once:"
        echo "  fish_add_path \"$TARGET_DIR\""
        ;;
      *)
        echo "Add to your shell rc:"
        echo "  export PATH=\"$TARGET_DIR:\$PATH\""
        ;;
    esac
    echo
    echo "Then start a new shell and run \`multivac --help\` to confirm."
    ;;
esac

# Final sanity check (skipped on the idempotent re-run path)
if [ -z "${already_ok:-}" ] && command -v multivac >/dev/null 2>&1; then
  echo
  echo "multivac on PATH: $(command -v multivac)"
fi
```

After running, summarize for the user in one sentence what happened:

- **Symlink created & PATH OK:** "Done — `multivac` is on your PATH now. Try `multivac -i` from any shell. Note: the first `multivac` invocation builds the FTS index from `~/.claude/projects/` and may take up to ~60s if you have hundreds of past sessions. Subsequent runs are sub-second."
- **Symlink created but PATH missing:** "Symlink ready, but `<target-dir>` isn't on your PATH yet. Run the export line above, then start a new shell."
- **Already configured:** "Already set up — nothing to do."
- **Error (refusing to overwrite a non-symlink, or source not found):** surface the error and stop.

Do **not** modify the user's shell-rc files yourself. If they want the export line added, they can copy-paste it into their shell.

## Why we don't auto-modify shell-rc files

Modifying `~/.zshrc` or `~/.bashrc` without explicit consent is a long-standing source of "what happened to my dotfiles" complaints. The slash command prints the command for the user to run; they're one keystroke away from it. The setup-once nature of this means the trade-off heavily favors transparency over convenience.
