# Automation Studio Scale Certification

Automation Studio scale certification is the release gate for storage, graph,
runtime, query, cache/synchronization, and browser data-flow behavior. It
converts measured evidence into a reviewable report; implementation or unit-test
completion alone does not pass the gate.

The current runtime provides stable bootstrap owners, synchronous presentation
transactions, isolated shell regions, normalized project/query stores, local
view readiness boundaries, after-paint input-yielding cache/preload work, and
an imperative frame-coalesced canvas controller. Those mechanisms make
responsiveness testable; they are not browser measurements.

## Truthful Evidence Status

Keep the evidence classes distinct:

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Deterministic unit/source tests | Runtime ownership, transaction coalescing, exact store scopes, query identity, stale-token rejection, scheduler yield/cancel behavior, and one-frame canvas coalescing. | Input latency, frame pacing, main-thread task duration, browser heap, DOM cost, or production browser behavior. |
| Build/type/docs checks | Compilation, contracts, imports, and documentation consistency. | Responsiveness or scale. |
| SQLite plans/storage tests | Index selection, server-side limits, recovery, backup/replay, and payload boundaries. | Browser rendering or input latency. |
| Automated browser capture | Repeatable interaction, request, render, DOM, long-task, graph, and supported heap metrics. | Root cause without trace inspection. |
| Manual browser trace | Input-to-paint path, handler stacks, frame gaps, style/layout, paints, background timing, and retained-object investigation. | Results for a different environment. |

Use `not-run` when measurements have not been collected, `blocked` when a
required input is absent, and `failed` when evidence violates a gate. Never
replace missing browser measurements with deterministic test results.

Run the generator after building FluxIQ:

```bash
pnpm studio:certify -- --evidence .fluxiq/cache/automation-studio-scale-certification/evidence.json --output .fluxiq/cache/automation-studio-scale-certification/report.json
```

Without an evidence file the command emits a blocked template. This is expected.
Do not replace missing measurements with inferred or unit-test results.

The JSON input follows `AutomationStudioScaleCertificationInput` in
`packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts`.
Keep Playwright JSON, traces, screenshots, and scheduler diagnostics as
companion artifacts; summarize only compatible measurements in `scaleMatrix`
and `heapRetention`.

## Runtime Evidence Map

| Runtime contract | Deterministic evidence | Browser/operational evidence |
| --- | --- | --- |
| Stable runtime/bootstrap | Owner identity, disposal, cancellation, and project-generation tests. | Open/switch/close trace proving no remount loop or stale-project commit. |
| Synchronous presentation | Transaction and no-op publication tests. | Input-to-selection timing and region renders for rows, tabs, and breadcrumbs. |
| Isolated shell regions | Region ownership and local boundary tests. | Header/hierarchy/editor/inspector/timeline isolation plus local-state screenshots. |
| Normalized data/queries | Entity scopes, structural sharing, query-key, page, and freshness tests. | Scoped mutation traces and SQL plans/payloads for independent filters/pages. |
| Local view readiness | Loading/empty/error/ready/stale-ready and stale-token tests. | Cold activation before hydration, retained warm refresh, and stale-read navigation trace. |
| Cache/preload scheduler | After-paint, input yield, active-read priority, bounded work, and cancellation tests. | Development phase log plus browser trace showing work after paint and outside the input task. |
| Canvas controller | Frame scheduling, drag/marquee settlement, hover/viewport, and disposal tests. | Pointer/frame trace, React commits, graph DOM count, save count, and frame pacing. |

Each row remains incomplete until both applicable evidence columns are present.

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

## Collection Procedure

1. Freeze the commit, schema, feature flags, fixture generator, and source
   performance budgets.
2. Record hardware, OS, power mode, Node.js, pnpm, SQLite, browser, viewport,
   device scale factor, build mode, and dirty-worktree state.
3. Run deterministic checks and retain command output. Label this supporting
   contract evidence, not browser certification.
4. Generate and verify browser fixtures; record actual entity/event counts and
   the fixture manifest.
5. Run smoke, baseline, and target operations against SQLite WAL. Retain plans,
   bindings, elapsed time, result count, stable-order fields, and payload bytes.
6. Run append/subscription soaks, crash injection, backup/restore, and replay;
   retain p95s, drops/reconnects, integrity output, and digests.
7. Have a human operator start the panel, run automated Playwright capture, and
   record the manual traces required by the profiling runbook.
8. For each selected destination, verify its direct destination connector
   subscribes only to the normalized entity/query scopes needed by that view.
   Record the selection commit separately from connector hydration.
9. Assemble the typed evidence JSON and companion traces, screenshots,
   Playwright JSON, query plans, soak logs, and environment manifest.
10. Generate the report and review every blocker. A valid report is not
    necessarily a passing report.

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
warm destination switching, hierarchy and tab selection, tab-picker
interaction, cold destination open, Flow/folder create/delete, Runtime Debug
and run detail, hierarchy resize, graph selection, right-button marquee, graph
drag, and graph save where applicable. It must show bounded requests and no
unexpected project-summary refresh for scoped mutations.

For direct destination connectors, evidence must show:

- presentation selection commits before connector data completion;
- a cold connector publishes only a local loading/empty/error surface;
- a warm connector retains data as stale-ready while refreshing;
- query identity includes project, scope, filter, sort, page, and page size;
- unrelated destinations and shell regions do not rerender;
- an obsolete project generation or request token cannot publish.

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
browser persistence is an implementation detail and must remain
browser-neutral. Distinguish warm mounted view, persisted UI state, scoped
domain cache, lazy preload, and cold foreground read. Certification must show
that cache/preload queues after paint, yields to pending input and active work,
remains bounded, cancels when obsolete, and never owns visible selection.
Development background-work phases support ordering diagnosis; a browser trace
must separately prove the work ran outside the input task.

Registry, direct-connector, and composition tests are architectural evidence,
not browser timing evidence. Phase 12 remains blocked until the same build is
measured in a real browser with the required traces, request counts, long
tasks, DOM bounds, and retained-heap artifacts.

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
