# Automation Studio Scale Certification

Automation Studio scale certification is the release gate for storage, graph,
runtime, query, cache/synchronization, and browser data-flow behavior. It
converts measured evidence into a reviewable report; implementation or unit-test
completion alone does not pass the gate.

Run the generator after building FluxIQ:

```bash
pnpm studio:certify -- --evidence .fluxiq/cache/automation-studio-scale-certification/evidence.json --output .fluxiq/cache/automation-studio-scale-certification/report.json
```

Without an evidence file the command emits a blocked template. This is expected.
Do not replace missing measurements with inferred or unit-test results.

## Evidence Inputs

Certification combines four kinds of evidence:

- database and storage scale, query plans, payloads, crash recovery, backup, and
  deterministic replay;
- runtime and recording append/subscription soak results;
- browser interaction, render, DOM, request, long-task, and retained-heap
  measurements;
- authored and generated documentation validation.

The deterministic large-project fixture in the web feature provides repeatable
model and bounded-view coverage. Its defaults are 2,048 Flows, Subflows,
recordings, runs, instructions, adaptations, and clients; 8,192 actions and
State facts; and 4,096 hierarchy nodes. That fixture is supporting test evidence,
not a replacement for real SQLite query plans, browser traces, or soak runs.

Recording scale tests also enforce a 200-entry materialization window for the
timeline and action preview and reuse of the ordered preview index as selection
moves. Browser certification must verify the mounted element count; passing the
pure fixture test alone does not establish rendering or heap behavior.

Follow
[Automation Studio UI performance profiling](automation-studio-ui-performance-profiling.md)
for browser setup, required interactions, source budgets, artifacts, and manual
trace capture. Browser measurements are not currently implied by the accepted
refactor architecture and must be attached explicitly.

## Evidence Gates

The report contains one gate for each Phase 12 certification step:

- `12.1`: smoke, baseline, and target scale matrix with hardware, Node.js,
  SQLite, browser, build mode, operation timings, and payload sizes.
- `12.2`: 24-hour runtime append, recording append, and subscription soaks,
  including event count, p95 append latency, reconnects, and dropped events.
- `12.3`: crash injection during graph, stream, object, and migration writes,
  followed by integrity and orphan checks.
- `12.4`: retained heap across 1,000 project/view switches, enforcing the
  32 MiB retained-heap and one-second single-task ceilings from the scale plan.
- `12.5`: critical SQL query plans and payload budgets for catalog, hierarchy,
  graph, Runtime, recordings, instructions, adaptations, and object reads.
- `12.6`: backup restore and deterministic compiled-plan replay verified by
  project, plan, and trace digests.
- `12.7`: authored documentation paths and generated reference validation.
- `12.8`: feature-flag removal only after every preceding gate passes.

Browser interaction evidence must include project open/close/switch, empty and
warm view switching, tab-picker interaction, cold State open, Flow/folder
create/delete, Runtime Debug and run detail, hierarchy resize, graph selection,
graph drag, and graph save where applicable. It must show bounded requests and
no unexpected project-summary refresh for scoped mutations.

SQL evidence must demonstrate server-side limits and stable ordering. Runtime
history, run actions/events, recordings, Subflows, instructions, adaptations,
and other collection views may not claim scale readiness based on browser-side
pagination of an unbounded response. Detail payloads must be selected and
measured independently from list summaries.

Hierarchy evidence must include the
`list-project-hierarchy-children` query plan and pages for root and nested
parents. Each query must constrain one exact parent, use the stable
`sort_key, entry_id` cursor ordering, return only the requested sibling page,
and preserve static/system nodes when browser pages merge. Load-more evidence
must show that advancing one parent does not advance, replace, or hydrate its
siblings' child pages.

Any broad reload retained as recovery must be named in evidence with the
diagnostic that required it. Cache hits must be measured separately from cold
loads. Cache and synchronization evidence must remain browser-neutral; a
Chrome-only storage or messaging path cannot certify the product architecture.

Cache evidence must identify the layer under test. The in-memory data cache is
TTL-bound and invalidated by typed project/resource scopes. The persisted UI
cache contains workspace preferences and hierarchy sidebar state only; its
current browser fallback is bounded `localStorage`, optionally mirrored through
the program API. Certification must show that idle/debounced cache work does not
block activation, that stale project generations cannot publish, and that a
cache miss still paints a stable view before bounded detail hydration.

Registry and composition tests are architectural evidence, not browser timing
evidence. The canonical one-entry definitions and render-time host resolution
must pass their source/unit contracts, but Phase 12 remains blocked until the
same build is measured in a real browser with the required traces, request
counts, long tasks, DOM bounds, and retained-heap artifacts.

## Required Documentation Paths

Phase 12 documentation evidence cites:

- `docs/architecture/automation-studio/persistence.md`;
- `docs/architecture/automation-studio/workspace.md`;
- `docs/operations/automation-studio-scale-certification.md`;
- `docs/operations/automation-studio-ui-performance-profiling.md`;
- `docs/integrations/automation-studio-importing-repos.md`.

Validate authored links and generated reference freshness with:

```bash
pnpm docs:check
```

The repository does not automatically start the web panel for this gate. The
operator must start `pnpm --filter @fluxiq/web dev` manually, warm any required
Next.js routes before measuring, and run the browser capture from a separate
shell as described in the profiling runbook.

## Evidence Record

Store the evidence file, generated report, browser traces, Playwright JSON,
query plans, soak logs, and environment manifest together. The manifest records
the commit SHA, dirty-worktree state, OS, CPU, memory, power mode, Node.js,
pnpm, SQLite, browser, build mode, and fixture/data counts.

A rerun that changes hardware, browser, build mode, schema, fixture, or source
budgets is a new evidence set. Do not merge measurements from incompatible
environments without identifying each environment in the report.

## Release Rule

Do not remove storage, graph, runtime, subscription, cache, or compiled-plan
feature flags while certification is `blocked`, `failed`, or `not-run`.
Removal is permitted only when `overallStatus` is `passed`, every gate has no
blockers, documentation validation passes, and the complete evidence artifact
is attached to the release record.

Current architectural acceptance through the documented refactor phases does
not by itself satisfy this release rule.
