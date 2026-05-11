## MODIFIED Requirements

### Requirement: Armed state is visible in the picker

When the dangerous-resume capability is armed, the picker's status bar SHALL include an entry for the Alt-Enter / Shift-Enter binding rendered in yellow (using the existing `ansi.fgYellow` style). When the capability is not armed, the entry MUST NOT appear in the status bar. This requirement is now satisfied via the BINDINGS table's `visible: (deps) => !!deps.dangerouslySkipPermissions` predicate and the `category: "dangerous"` yellow styling, rather than via an inline yellow string in `render`.

#### Scenario: Status bar shows yellow danger entry when armed

- **WHEN** the picker is open and `args.dangerouslySkipPermissions === true`
- **THEN** the status bar includes an "Alt-Enter dangerous" entry (also showing Shift-Enter as a fallback key spelling) in yellow

#### Scenario: Status bar omits danger entry when not armed

- **WHEN** the picker is open and `args.dangerouslySkipPermissions === false`
- **THEN** the status bar does NOT include any Alt-Enter / Shift-Enter entry
