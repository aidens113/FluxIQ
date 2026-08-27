# UI Theme

FluxIQ global programs share one visual design language.

The style should feel AWS-inspired: compact, modular, predictable, and
optimized for repeated operational work. This is a visual style direction, not
a requirement to copy AWS Console navigation or UX patterns.

## Principles

- Use a simple categorized program directory for global and domain program
  areas.
- Use program metadata icons from the global catalog.
- Prefer dense panels, tables, lists, tabs, toolbars, and status badges.
- Keep panels bordered and flat; avoid decorative gradients and oversized hero
  sections.
- Use blue for primary actions, orange for focus/accent, and neutral grays for
  structure.
- Keep card radius at `8px` or less.
- Do not let individual programs define their own color palettes.
- Program alerts and action statuses route through the shared global alert
  viewport in the top-right corner. Views should not render status alerts inline
  where they resize, cover, or push the working surface.

## Shared Classes

Global program UI should use the shared app-level classes:

- `directory-page`
- `directory-topbar`
- `program-category-list`
- `program-category-section`
- `console-topbar`
- `console-content`
- `program-grid`
- `program-card`
- `toolbar`
- `panel`
- `button`
- `button-primary`

`StatusText` and `VisualAlert` from shared UI are notification emitters, not
inline layout blocks. Use them for status/result messages that should appear in
the global top-right alert stack. Keep modals only for confirmations or flows
that require explicit user input.

Framework theme tokens are exported from `fluxiq/ui` as
`fluxiqConsoleTheme`.
## Semantic Color Contract

Color names describe UI meaning rather than a component or one-off shade:

- canvas and surfaces: `background`, `surface`, `surfaceRaised`, `surfaceSubtle`, and `surfaceMuted`;
- content: `text`, `textMuted`, `textSubtle`, and `textInverse`;
- structure: `border` and `borderStrong`;
- interaction: `primary`, `primaryHover`, `focus`, `selectedSurface`, and `selectedBorder`;
- status: foreground, surface, and border tokens for info, success, warning, and danger;
- technical content: `codeSurface` and `codeText`;
- modal layering: `overlay`.

The web shell exposes matching `--color-*` variables and keeps `--color-bg` and
`--color-accent` only as legacy aliases. Do not add a literal selected, status,
focus, code, or overlay color when a semantic token exists. Normal-size text
pairs must meet 4.5:1 contrast; focus and meaningful non-text boundaries must
meet 3:1. `packages/fluxiq/src/ui/index.test.ts` enforces the exported theme's
canonical text and focus pairs.
## Typography Contract

FluxIQ uses a compact operational scale exported through
`fluxiqConsoleTheme.typography` and matching web variables:

- caption 11px; compact 12px; small body 13px; body 14px; large body 15px;
- small title 16px; title 18px; large title 20px; page title 24px; display 28px;
- compact line height 1.3; body 1.45; heading 1.2;
- regular 400; medium 500; semibold 600; bold 700.

Use caption and compact sizes for metadata and dense rows, body sizes for forms
and reading, and title sizes only for real hierarchy boundaries. Panel and
sidebar headings must not use page or display sizes. Letter spacing is always
zero. Do not scale type with viewport units. Dynamic container fitting is
allowed only for fixed-format visual content and may not shrink below 11px.
Monospace content uses `monoFamily` or `--font-family-mono`.
## Geometry And Focus Contract

The public theme and web variables define:

- spacing from 2px through 32px with named compact, dense, and standard roles;
- 28px compact, 32px default, and 38px comfortable controls plus a 32px icon control;
- 2px small, 4px control, 6px medium, 8px panel, and pill radii;
- one- and two-pixel border roles;
- panel, popover, and modal elevation;
- a two-pixel orange focus ring with a two-pixel offset.

Use compact controls only in dense toolbars and grids. Forms use comfortable
controls; ordinary commands use default controls. Cards and framed tools may use
the panel radius, but page sections remain unframed. All interactive elements
receive the baseline `:focus-visible` ring. A feature may adjust ring offset for
clipping, but may not suppress the ring without providing an equally visible
replacement.
## Status Vocabulary

All raw status values pass through `normalizeFluxIQStatus`,
`fluxiqStatusTone`, and `fluxiqStatusLabel` from `fluxiq/ui`.

- neutral: idle, off, disabled, cancelled, unknown, and domain-specific values;
- info: queued, pending, proposed, draft, running, recording, scheduled, and syncing;
- success: active, ready, enabled, online, completed, passed, matched, approved, and low risk;
- warning: waiting, paused, retrying, degraded, manual approval, needs review, and medium risk;
- danger: failed, error, offline, rejected, blocked, critical, and high risk.

Status badges use only `tone-neutral`, `tone-info`, `tone-success`,
`tone-warning`, or `tone-danger` classes. Backend strings must never become CSS
class names. Every badge combines an icon, semantic foreground/surface/border,
and a normalized sentence-case label, so color is never the only signal. Toast
alerts retain their info/success/warning/error API; error maps to danger colors.
## Surface Hierarchy

Light UI depth uses five roles:

- shell: application canvas and space between owned regions;
- pane: primary working content and dialogs;
- tool: sidebars, toolbars, headers, metadata, and secondary controls;
- selected: the single selected/active item treatment;
- code: raw JSON, source, logs, and other technical text with matching code content color.

The web aliases are `--surface-shell`, `--surface-pane`, `--surface-tool`,
`--surface-selected`, `--surface-code`, and `--content-code`. Do not create
depth by wrapping page bands in decorative cards or nesting cards. Use borders
for pane ownership, restrained elevation only for overlays, and selected surface
only for actual selection or active state.
## Motion And Layer Contract

Motion uses 120ms fast transitions, 220ms ordinary transitions, 720ms activity
indicators, and the standard ease curve. Motion communicates continuity or
activity only; it is not decoration. Under `prefers-reduced-motion: reduce`, all
animations run once at near-zero duration, transitions become immediate, and
scroll behavior becomes automatic.

Layer values are bounded and semantic: base 0, raised 10, sticky 20, dropdown
40, overlay 100, modal 110, toast 120, and critical 130. Features must not invent
large numeric z-index values. Local stacking contexts should use base/raised;
fixed global UI must use the smallest global role that matches its ownership.
## Button And Link Primitives

New command UI uses `Button`, `IconButton`, and `ActionLink` from shared web UI.
`Button` owns secondary, primary, danger, and ghost variants; compact/default
sizes; and disabled/busy behavior. Busy buttons set `aria-busy`, disable repeat
activation, and retain their command label beside an activity icon.

`IconButton` requires a human-readable `label`, which supplies both accessible
name and tooltip. Use it for familiar symbolic commands. `ActionLink` is for
navigation and preserves link semantics plus a visible hover underline. Do not
use a button for navigation or a link for mutation. Existing feature-owned raw
buttons migrate when their owning view is rebuilt; new raw `.button` variants
must not be introduced.
## Field And Validation Primitive

`Field` owns a visible label and stable control ID. Optional hint and error text
receive deterministic IDs and are connected through `aria-describedby`.
Required fields show a visible marker and `aria-required`; invalid fields set
`aria-invalid`, use the danger border, and announce the error through
`role="alert"` with an error icon.

Form inputs, selects, and textareas use the comfortable 38px control height,
full available width, and shared focus treatment. Disabled controls remain
readable and visibly unavailable. Placeholder text is never the only label or
instruction. Validation belongs beside its field; completed background results
belong in the global alert system.

## Choice And Disclosure Primitives

Use `Segmented` for small, mutually exclusive mode sets and expose the active
choice through `aria-pressed`. Use native `select` controls for fixed option
sets. Use `Combobox` only when users benefit from searching a larger object
set; it owns combobox/listbox semantics, keyboard selection, and an explicit
empty result.

Use `Menu` for secondary action sets. It owns trigger disclosure state, menu
roles, arrow/Home/End/Escape navigation, disabled actions, and danger styling.
`Tooltip` is supplemental help only and must wrap a control that already has an
accessible name.
## Tabs And Overflow

Tabs use tablist, tab, and tabpanel semantics with one tab in the keyboard order.
Arrow keys move between adjacent tabs, Home/End move to boundaries, and the
workspace supports Ctrl/Cmd+W and middle-click close. A close command is a real
button with a tab-specific accessible name.

Scrollable tab strips hide their native scrollbar so it never consumes control
height. Persistent previous/next controls provide direct scrolling, and a
searchable open-tabs picker provides deterministic access to every tab. Long
labels truncate visually while preserving their full title and accessible text.
## Dialogs, Authorization, And Drawers

All blocking overlays use the shared `Modal`, `AlertDialog`,
`AuthorizationDialog`, or `Drawer` compositions. Dialogs expose labelled
titles and optional descriptions, trap focus, set the rest of the page inert,
lock background scrolling, restore prior focus, and close on Escape unless a
busy operation makes interruption unsafe. Footers remain reachable at the
bottom of constrained viewports.

Use `AlertDialog` for consequential confirmation and name the affected object
and consequence. Use `AuthorizationDialog` only after a protected command is
initiated. Credential requirements are supplied by policy and may include
password, PIN, and authenticator code; ordinary forms do not display these
fields preemptively. Drawers use the same focus and background ownership as
dialogs. Menus and other nonblocking popovers use the dropdown layer and dismiss
when focus leaves.
## Feedback And Loading

Persistent warnings, errors, and contextual explanations use `InlineNotice` and
remain attached to the affected surface. Completed action results and transient
status use `StatusText` or `notifyGlobalAlert` and appear in the global toast
viewport. Error notices use an alert role; other tones use status. Both combine
icon, text, and semantic color.

Use `LoadingState` when replacing a bounded surface, `Skeleton` when the
shape of incoming content is known, `Progress` for determinate or indeterminate
work, and `EmptyState` for a completed load with no content. Loading labels
name what is being fetched. Empty-state text explains the next useful action
without describing the interface. Reduced-motion rules collapse all activity
animation.
## Data, Lists, Pagination, And Trees

Tables require a visible or visually hidden label, scoped column headers, stable
row keys when data has identity, explicit loading ownership, and a row spanning
empty state. Compact density is reserved for operational tables.

Paginated lists place `Pagination` after the result set. It shows the current
range and page count, first/previous/next/last controls, loading-disabled state,
and an optional page-size select. Page/filter/sort persistence and SQL ownership
remain feature responsibilities.

`ListRow` gives the full primary row a single open action while keeping
secondary icon actions outside that button. `Tree` uses tree/treeitem/group
semantics, roving focus, selected and expanded state, Up/Down/Home/End movement,
Left/Right hierarchy navigation, and Enter/Space selection. Feature trees supply
stable IDs and own persisted expansion.
## Workspace And Technical Primitives

`Toolbar` groups commands under an explicit accessible name and may scroll
horizontally in constrained widths. `Breadcrumb` preserves link/button/current
page semantics and truncates long ancestors without hiding the active context.

`Splitter` is always visible and exposes separator orientation and numeric
value. Arrow keys adjust by one step, Shift accelerates, Home/End move to
bounds, and Enter or double-click resets when supported.

`JsonViewer` is collapsed by default and does not traverse or stringify its
value until opened. Its preview is depth/item/string bounded and inserts a
visible omission marker. `CodeViewer` owns search count, line wrapping, copy,
optional download, constrained scrolling, monospace content, and semantic code
surfaces. Full large payloads remain server-fetched on explicit detail demand.