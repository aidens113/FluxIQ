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
