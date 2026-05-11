## MODIFIED Requirements

### Requirement: Each recent row shows a synthesized title plus tail snippet

Each row in the recent-browse view SHALL show two visual lines:

- **Line 1** (header): The **display title** for the conversation, followed by a metadata suffix containing project name, date, message count, and short session id. The display title precedence is: (1) saved name from `sessions.json` if present; (2) the synthesized title from the first non-wrapper user message, truncated to 80 chars; (3) if neither exists, no leading title and line 1 starts with the metadata.
- **Line 2** (snippet): The **tail snippet** — the last 1-2 visual lines of the most recent user-or-assistant message of the conversation, plain-text (no FTS highlighting), dimmed with the same styling the existing FTS snippet uses.

If the most recent message is empty or contains only wrapper content, the next-most-recent user/assistant message is used. If no usable message exists, line 2 MUST be omitted (single-line row) rather than displaying a blank line.

#### Scenario: Saved name takes precedence over synthesized title

- **WHEN** a conversation has both a synthesized title and a saved name in `sessions.json`
- **THEN** line 1 leads with the saved name
- **AND** the synthesized title is not shown anywhere on the row

#### Scenario: Synthesized title used when no saved name

- **WHEN** a conversation has no entry in `sessions.json` but has a usable first user message
- **THEN** line 1 leads with the synthesized title (current pre-change behavior)

#### Scenario: Metadata-only row when neither exists

- **WHEN** a conversation has no saved name and no usable user message for synthesis
- **THEN** line 1 starts with the metadata suffix (`<proj>  <date>  <N> msgs  <short-id>`), no leading title

#### Scenario: Title comes from first user message (unchanged)

- **WHEN** a conversation has no saved name, and its first user message is `"How do I write a custom Claude Code skill?"`
- **THEN** the row's line 1 begins with `"How do I write a custom Claude Code skill?"` (possibly truncated with `…`), followed by ` · <project> · <date> · <N> msgs · <short-id>`

#### Scenario: Wrapper messages skipped during title synthesis (unchanged)

- **WHEN** a conversation has no saved name and its first user message content starts with a recognized wrapper marker
- **THEN** the synthesized title comes from the next user message that is not a wrapper

#### Scenario: Tail snippet shows last conversation content (unchanged)

- **WHEN** the user views the recent-browse list
- **THEN** each row's line 2 is the last 1-2 visual lines of the most recent user-or-assistant message in that conversation

#### Scenario: Empty tail collapses to one-line row (unchanged)

- **WHEN** a conversation's most recent message has empty content and no earlier user/assistant message has usable text
- **THEN** the row renders as a single header line (no blank snippet line beneath it)
