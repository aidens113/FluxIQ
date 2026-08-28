# Automation Studio Scale Certification

Automation Studio scale certification is the final release gate for the v2
storage, graph, runtime, and browser data-flow architecture. It turns the scale
targets from `docs/working/automation-studio-scalable-data-architecture-plan.md`
into an evidence report that can be reviewed before feature flags are removed.

Run the report generator after building FluxIQ:

```bash
pnpm studio:certify -- --evidence .fluxiq/cache/automation-studio-scale-certification/evidence.json --output .fluxiq/cache/automation-studio-scale-certification/report.json
```

Without an evidence file the command prints a blocked template. That template is
intentional: certification is not passed until every Phase 12 gate has explicit
evidence attached.

## Evidence Gates

UI interaction evidence is captured through the browser fixtures and budgets in
`docs/operations/automation-studio-ui-performance-profiling.md`. Run that
checklist before attaching Phase 12 evidence so the scale report includes
operator-visible responsiveness, not only storage/backend timings.

Certification must include both data-scale and interaction-scale evidence. The
accepted browser trace shows project open, empty view switching, Flow
create/delete, folder create/delete, Runtime Debug open, run-log open, graph
selection, and graph drag as settled interactions with bounded request counts
and no unexpected root-summary refresh on scoped mutation paths. Any broad
reload used as recovery must be named in the trace notes with the diagnostic
that required it.

The report contains one gate for each Phase 12 step:

- `12.1` full smoke, baseline, and target scale matrix, including hardware,
  Node.js, SQLite, browser, build mode, operation timings, and payload sizes.
- `12.2` 24-hour runtime append, recording append, and subscription soaks with
  event counts, p95 append latency, reconnect count, and zero dropped events.
- `12.3` crash injection during graph writes, stream writes, object writes, and
  migrations, with integrity checks and orphan counts after recovery.
- `12.4` heap retention across 1,000 project/view switches, enforcing the 32
  MiB retained-heap and 1-second single-task ceilings from the scale plan.
- `12.5` critical query plans and payload budgets for hierarchy, graph,
  runtime, recording, instruction, adaptation, object, and catalog reads.
- `12.6` backup restore plus deterministic compiled-plan replay, verified by
  project, plan, and trace digests.
- `12.7` authored documentation paths and generated reference validation.
- `12.8` feature flag removal gates. Flags remain removable only when all prior
  evidence is present and passing.

## Required Documentation Paths

Phase 12 documentation evidence should cite these authored paths:

- `docs/architecture/automation-studio/persistence.md`
- `docs/operations/automation-studio-scale-certification.md`
- `docs/integrations/automation-studio-importing-repos.md`

Generated reference freshness is checked with:

```bash
pnpm docs:check
```

## Release Rule

Do not remove v2 storage, graph, runtime, subscription, or compiled-plan feature
flags while the certification report status is `blocked`, `failed`, or
`not-run`. Removal is allowed only when `overallStatus` is `passed`, every gate
has no blockers, and the report artifact is attached to the release record.
