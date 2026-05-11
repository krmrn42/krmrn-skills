## Context

`sessions.json` already exists (introduced by `picker-rename-session`) with a `pins` field reserved for this change. This change activates that reservation: the picker now reads + writes the `pins` array, and `recentConversations` / `ftsSearch` consumers re-order their result sets to surface pinned rows first.

Pinning is intentionally lightweight — no metadata beyond membership in a set. Position within the pin list is determined by pin order (newest pin first), which the user can rearrange by unpinning + re-pinning.

## Goals / Non-Goals

**Goals:**

- Ctrl+P toggles pin state for the selected row, persists immediately, and the next render shows the new ordering.
- Pinned rows always at the top in both recent-browse and FTS modes.
- Visual divider so the user always knows which rows are pinned vs. ranked/recent.
- `--unpin-all` for fast cleanup.

**Non-Goals:**

- Drag-to-reorder pins. Newer-pin-first is sufficient; if a user wants a specific order, they unpin then re-pin in their desired sequence.
- Pin metadata (notes, colors, tags). Plain membership only.
- Maximum pin count. We don't enforce one. If a user pins 50 conversations, that's their call — though we note it in the help text that pin count is bounded only by `--limit`.
- Per-project pin namespacing. Pins are global by session id (same model as names).

## Decisions

### Decision 1: Pinned-first, divider, then the rest

In recent-browse:

```
📌 pinned-row-A · proj · date · …
   tail snippet
📌 pinned-row-B · proj · date · …
   tail snippet
── recent ──
   recent-row-1 · proj · date · …
   tail snippet
   recent-row-2 · proj · date · …
   ...
```

The divider is a single dim line `── recent ──` rendered with the same dim style as the snippet text. In FTS mode, the divider reads `── results ──`. The divider counts as one visual row when computing `maxVisible` against the picker's body height. The cursor cannot land on the divider — Up/Down skip over it.

**Alternative considered: separate pinned-section header.** Rejected — too heavy for what is structurally a one-line divider.

### Decision 2: Pinned rows count toward `--limit`

If `args.limit = 5` and the user has pinned 4 rows, recent-browse shows 4 pins + 1 ranked recent. If they've pinned 7, only 5 of those pins are visible (the 5 most recently pinned) and zero non-pinned rows. The user adjusts via `--limit` or by unpinning.

**Alternative considered: pinned rows in addition to the limit (so `--limit 5` + 4 pins → 9 rows).** Rejected. The limit is a user-facing budget; expanding it implicitly violates the principle of least surprise.

### Decision 3: Pinning in FTS mode promotes pinned matches, not all pins

If a user pins conversation X and then searches for "foo" which doesn't match X, X is NOT shown. Pinning doesn't override the query. This is consistent with users' mental model: "show me what I'm looking for, and surface pinned ones first if they match."

If conversation X IS in the FTS result set, it's lifted to the top regardless of its BM25 score.

### Decision 4: Visual indicator — `📌` with `*` fallback

Pinned rows lead with `📌 ` (pin emoji + space). On `--no-color` (which we interpret broadly as "minimal terminal"), the indicator falls back to `* ` for portability. The indicator is **before** the title/metadata on line 1.

We don't gate the emoji on `process.stdout.isTTY` or locale — modern terminals support emoji. If the user's terminal renders it as a tofu box, that's their terminal's call; the row still works functionally.

### Decision 5: `--unpin-all` is the only batch-mutation flag

Edge-case management. We deliberately don't add `--pin <id>` or `--unpin <id>` CLI flags because those duplicate the picker affordance for a workflow nobody asked for. `--unpin-all` is the one knob that's useful for "wipe my pins" without launching the picker.

### Decision 6: Backward-compat for `--print-names`

`picker-rename-session` added `--print-names`. After this change, that flag still works and prints the entire `sessions.json` (which now includes pins). No new flag introduced. Users who scripted around `--print-names | jq '.names'` get the same data; users who want pins use `--print-names | jq '.pins'`.

## Risks / Trade-offs

- **Risk: a user pins many sessions and then is confused by what's "recent"** — recent-browse becomes dominated by pins. → Mitigation: the visual divider makes the split obvious; the `--limit` knob is the explicit lever; we don't try to be clever.
- **Risk: pin emoji renders poorly on some terminals.** → Mitigation: `--no-color` falls back to `* `. We accept tofu boxes on terminals that lack emoji support; the functional behavior is unchanged.
- **Trade-off: divider eats a visible row.** Worth the clarity; the alternative (a column indicator only) is harder to parse at a glance.
- **Risk: pin order (most-recently-pinned first) is non-obvious.** → Mitigation: documented in the `--help` entry for the pin keybinding and in the README; users who care about specific order can unpin + re-pin to rearrange.

## Dependencies

This change **requires** `picker-rename-session` to have landed (or to be implemented before it). The config-file infrastructure (`sessionsConfigPath`, `loadSessionStore`, `saveSessionStore`) is established by that change. If land order is reversed, this change would need to introduce the config-file plumbing itself — easy enough but doubles the surface area.
