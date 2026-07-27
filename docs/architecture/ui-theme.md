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

Framework theme tokens are exported from `fluxiq/ui` as
`fluxiqConsoleTheme`.
