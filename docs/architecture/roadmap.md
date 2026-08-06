# Roadmap

This roadmap describes the intended direction of the public FluxIQ framework.
It is not a release promise; it is the working plan for the current refactor.

## Near Term

- Improve authored documentation for every global program.
- Replace shallow generated docs with richer generator output.
- Add proper Markdown/MDX rendering for the Docs program.
- Improve TypeDoc reference metadata for exported TypeScript APIs.
- Continue hardening global program UIs around real v1 functionality.
- Persist remaining global program state in SQLite where appropriate.

## Automation Studio

Automation Studio is the central planned program. It should be treated as a
program, not as a separate special-case app.

Planned Automation Studio areas:

- task editor;
- routine editor;
- interface editor;
- recording browser;
- policy proposal review;
- generated policy approval;
- input/output requirement validation;
- domain capability inspection.

Automation Studio must generate policies through declared domain inputs and
outputs. It must not assume hidden domain behavior.

## Documentation

Docs should become a living operator and developer reference.

Planned documentation work:

- richer TypeDoc summaries for exported framework contracts;
- generated program capability pages;
- generated IO contract pages for host projects;
- generated database schema/state pages;
- anchor-level link validation in addition to current file-level checks.

## Data Management

Database Manager should become the authoritative explorer for framework data.

Planned work:

- migration registry UI;
- schema summaries;
- row editing with permission gates;
- domain database navigation;
- JSON record inspector improvements.

## Runtime And Compute

Production Runner and Compute Control should converge into a coherent runtime
execution model.

Planned work:

- compute client protocol;
- command acknowledgement;
- workload assignment;
- lease lifecycle views;
- durable production run history;
- cancellation and retry semantics.

## Public Framework Boundary

FluxIQ should remain domain-neutral.

Never add private project behavior, domain-specific automation, or OSRS-specific
code to this repository. Domain projects should import FluxIQ and register their
own manifests, inputs, outputs, programs, adapters, and policy artifacts.
