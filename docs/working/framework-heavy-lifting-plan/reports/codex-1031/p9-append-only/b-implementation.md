# P9 B implementation — frozen source

Scope: model projection only. Source frozen after implementation; no checks,
builds, audits, browsers, providers, API calls or git operations were run.

## Projection contract

- Existing `callId: core.route_state.N` and `toolId: core.route_state` remain.
- First value: `{seen, state}` where `state` is the full screened flattened map.
- Later value: `{seen, baseSituation, updates, removed}`. `baseSituation` is the
  actual immediately preceding route entry's callId, including across rounds.
- Reconstruct by copying that prior situation's state, deleting each exact
  flattened key in `removed`, then setting each exact key/value in `updates`.
- Missing update means unchanged; an explicit null update remains a value.
  Object key order is canonical; array order is significant. Empty updates and
  removals are allowed for distinct raw situations with the same screened state.

## Implementation

- `build-routing.shown` caches each screened projection when first shown and
  returns independent copies. Earlier entries keep their bytes and identities.
- Existing call placement, fallback anchors, round anchoring and deduplication
  stay intact. `SITUATIONS_SHOWN` explains baseline/delta reconstruction.
- `screen-situation.ts` withholds credential-shaped values/keys before comparison,
  refuses denied evidence, and snapshots safe values using Core's existing
  `automationStudioLlmEvidenceCanonicalJson`; error prose never enters evidence.
- `delta.ts` reuses that canonical helper, distinguishes missing/null, emits
  explicit removals and fails closed on unreadable comparison.
- Full observations, `context()`, recording/execution, routing and signature
  generation are unchanged. Upstream flattening already omits null and globally
  suppresses duplicate flattened situations; those established semantics remain.
  The delta helper's null distinction applies when a supplied flattened key has
  null, rather than changing upstream flattening to expose null values.

## Authored coverage (not executed)

- Reconstruction of every screened full situation; unchanged/one-key/nested/array
  changes; null versus removal; secret-to-withheld removal; deterministic object
  order; unreadable comparisons; denied/secret/error screening; input snapshots.
- Immutable historical entries and caller mutation isolation; missing-call
  fallback; new-round anchors and real previous identity; full context retained.
- Existing routing execution and signature assertions were left unchanged.

Outcome: Done
Changed: route-state/build-routing.ts; route-state/index.ts; route-state/delta.ts; route-state/screen-situation.ts; route-state/tests/shown-window.test.ts; route-state/tests/delta.test.ts; route-state/tests/screen-situation.test.ts; this report.
Validation: not run — B brief reserves all acceptance checks/builds/audits for lead after writers freeze.
Not verified: TypeScript, owning tests, structure audit, request integration, browser behavior.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/b-implementation.md
Notes: Source frozen. No shared documents, execution/signature code, generated output or other writers' paths changed.
