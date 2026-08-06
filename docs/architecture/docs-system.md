# Documentation System

FluxIQ documentation has two layers:

- authored Markdown written by maintainers;
- generated Markdown, HTML, and JSON written by the Docs program from live
  framework state.

Both layers live under the normal repository `docs/` folder so documentation is
readable in Git and in the control panel.

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
  generated/
    README.md
    ...
```

Authored docs are the source of truth for design intent, current behavior,
architecture, and roadmap notes.

Generated docs are inventory and runtime reference pages. They should help
operators inspect the current repository and running framework, but they are
not a replacement for authored design documentation.

## Generated Docs

The Docs program writes generated documentation under:

```text
docs/generated/
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
- TypeDoc-backed framework reference Markdown;
- TypeDoc HTML site;
- TypeDoc JSON reflection model.

Generated Markdown pages are intentionally deterministic repository files.
TypeDoc HTML and JSON artifacts are also generated for API inspection. The Docs
program scans Markdown, HTML, and JSON documentation files so authored docs,
generated pages, and TypeDoc artifacts can be browsed from one hierarchy.

## Rebuild Flow

Docs rebuilds happen when:

- the user clicks **Rebuild Docs** in the Docs program;
- the `docs.rebuild` background task runs;
- code calls `runtime.docs.rebuild()`.

During a rebuild, FluxIQ:

1. runs registered documentation generators;
2. writes generated documentation files under `docs/generated`;
3. scans the configured docs root;
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

Planned upgrades:

- add syntax highlighting;
- add table-of-contents extraction;
- add link validation;
- improve generated reference pages with richer symbol metadata.

## Agent Rule

When substantial framework behavior changes, update authored docs in the same
change. Generated docs can be rebuilt after the change, but authored docs must
explain intent, ownership, and usage.
