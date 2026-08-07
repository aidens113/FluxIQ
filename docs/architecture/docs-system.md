# Documentation System

FluxIQ documentation has three layers:

- authored Markdown written by maintainers;
- a deterministic framework API reference generated from source exports and
  packaged with `fluxiq`;
- ephemeral Markdown, HTML, and JSON operator snapshots generated from the
  active importing repository and live framework state.

The first two layers live in `docs/` and are versioned. Operator snapshots live
under ignored `.fluxiq/cache/docs/`. The Docs program presents both sources in
one explorer without conflating runtime observations with authored truth.

## Source Layout

```text
docs/
  README.md
  architecture/
    README.md
    current-system.md
    docs-system.md
    migration-plan.md
    program-layout.md
    roadmap.md
    ui-theme.md
  programs/
    global-programs.md
  operations/
    data-and-state.md
  reference/
    framework-reference.md

.fluxiq/cache/docs/
  index.md
  ...
```

Authored docs are the source of truth for design intent, current behavior,
architecture, and roadmap notes.

The committed reference is deterministic and contains no timestamp, local
filesystem root, Git state, database count, or scheduler state.

## Runtime Documentation Snapshots

The Docs program writes rebuildable operator documentation under:

```text
.fluxiq/cache/docs/
```

Generated pages currently include:

- platform map;
- global program catalog;
- global program API map;
- database inventory;
- background task state;
- deployment sync state;
- registered host domains;
- registered host inputs and outputs;
- framework reference Markdown copied from the packaged deterministic
  reference, or regenerated from TypeDoc when FluxIQ source files are present;
- TypeDoc HTML site when FluxIQ source files and TypeDoc are available;
- TypeDoc JSON reflection model when FluxIQ source files and TypeDoc are
  available.

These pages are intentionally host- and time-specific. They may contain
database counts, task schedules, Git metadata, importer domains, or registered
IO. They must not be committed. Installed/importing repositories do not need
TypeDoc or FluxIQ source files to show the framework reference; the rebuild
copies the packaged deterministic Markdown reference into the runtime cache.
When the source tree and TypeDoc are available, the rebuild also refreshes
local TypeDoc HTML and JSON artifacts for interactive API inspection.

## Rebuild Flow

Docs rebuilds happen when:

- the user clicks **Rebuild Docs** in the Docs program;
- the `docs.rebuild` background task runs;
- code calls `runtime.docs.rebuild()`.

During a rebuild, FluxIQ:

1. runs registered documentation generators;
2. writes operator snapshot files under `.fluxiq/cache/docs`;
3. scans the allowlisted authored and runtime-cache roots;
4. caches page metadata for the Docs program;
5. renders individual documentation pages on demand.

## Current Renderer

Markdown rendering supports headings, lists, tables, links, inline code, fenced
code blocks, and blockquotes. JSON files render as formatted code blocks. HTML
files render read-only inside the Docs viewer after scripts and inline event
handlers are stripped.

The Docs UI uses a folder-style explorer backed by normalized document routes.
Internal links are resolved inside the program when the target document exists.

Documentation sources registered through the web API must stay inside the
runtime's configured documentation roots. FluxIQ checks both configured paths
and their canonical filesystem targets before scanning or reading pages. This
prevents a documentation source or persisted cache entry from becoming an
arbitrary local-file reader.

Markdown and JSON use FluxIQ's escaped renderers. Imported HTML is cleaned for
readability and displayed in a sandboxed frame without script, form, same-origin,
top-navigation, or external network privileges. Imported HTML must never be
injected directly into the control-panel document.

Repository validation:

- `pnpm docs:reference` regenerates the deterministic TypeDoc-backed Markdown
  inventory in both `docs/reference/` and the packaged `fluxiq` docs asset;
- `pnpm docs:check` validates local Markdown links and fails when the committed
  reference is stale;
- CI runs `pnpm docs:check` after building the repository.

Planned upgrades:

- add syntax highlighting;
- add table-of-contents extraction;
- improve generated reference pages with richer symbol metadata.

## Agent Rule

When substantial framework behavior changes, update authored docs in the same
change. Generated docs can be rebuilt after the change, but authored docs must
explain intent, ownership, and usage.
