# Report: core-runtime-test-health

Worker: `core-runtime-test-health`. Brief: `### Brief: core-runtime-test-health`
in `docs/working/mvp-week1-web-automation-reliability-plan.md`.

## Outcome

Done. All five tests the brief named pass. Three were real defects (one in a
test, two in source); the two pagination cases were a test-design problem.

`pnpm --filter fluxiq test` ran twice: **827 passed / 828 both times**, the
single failure being `runtime-stream-store.test.ts > … at a million events`,
which is outside my brief and which I show below is environmental, not code.
`pnpm check` exits 0. Repo `pnpm test`: contracts 7/7,
client-gateway-websocket 3/3, fluxiq 827/828; `apps/web` never ran, because
pnpm stops at the first failing package.

## What changed and why

### 1. `runtime-llm-grants` — the test was wrong, and had never passed

Issuing a `build_and_adapt` grant is gated on Flow bootstrap being able to run.
`flowBootstrapGenerationReadiness` (`api/handlers/llm-generation.ts`) requires
`llmExecutionGrantsConfigured`, `providerResolverConfigured` and
`nativeNodeRegistryConfigured`; the last one
(`service.ts getFlowBootstrapGenerationRuntimeReadiness`) needs the built-in
Start and End definitions **plus at least one executable non-control node**
from a registered manifest.

`createGlobalProgramRuntime` binds no native node runtime. The host does, through
`FluxIQ`'s `nativeNodeRuntime` option or `bindAutomationStudioNativeNodeRuntime`
(`framework/index.ts:179,227`). The test composed the global runtime and issued
a grant without one, so the gate correctly refused.

**It has never passed.** The gate and the test arrived in the same commit,
`5361951` (2026-09-07). A clean `git archive` copy of `5361951`, run in
isolation, fails identically:
`Flow bootstrap generation runtime is unavailable.: expected false to be true`.

The gate is the intended behaviour, and is asserted elsewhere:
`api/handlers/tests/llm-generation.test.ts:203` asserts that
`issueLlmExecutionGrant` returns exactly this refusal when readiness is
unsupported. So the fix belongs in the composition test: it now binds a
host-style native runtime with one executable importer node, mirroring
`permissionScopedNativeRuntime` in `service-flow-bootstrap-generation.test.ts`.
No assertion was changed or weakened.

### 2 and 3. The two `service.test.ts` cases — source defects from `0271d60`

**Bisected, not guessed.** Clean `git archive` copies with the real
`node_modules` junctioned in:

| Tree | `turns mapped observations …` | `approves edited recording …` |
| --- | --- | --- |
| `0271d60~1` | pass | pass |
| `0271d60` | fail | fail |

`0271d60` (2026-09-09) changed `getFlow` from returning the stored document to
returning `materializeCanonicalGraphFlow(...)`: once a Flow has revisions in the
per-project SQL graph, its nodes and edges are read back from that graph. Writes
were never routed to match, which produced three lost-write faults.

#### (a) The `"legacy"` sentinel leaked back as a version

The graph store records a node that pins no definition version under the
sentinel string `"legacy"` (`storage/project/graph-store.ts:198` and
`nodeRecordFromArtifact`). Both snapshot-to-document conversions copied that
string back verbatim into `definitionVersion`, and the next save failed model
validation: `Invalid Automation Studio Flow: nodes.0.definitionVersion
(flow.node_invalid_definition_version)` (`model/validation/flow.ts:104`, which
requires major.minor.patch).

Fixed once, in `runtime/service/flows/mapping.ts` — the module that already owns
"shape conversions between Flow documents and their SQL projections" — as
`flowNodeFromGraphRecord`, which omits the field for the sentinel. Both callers
now use it:

- `flows/store.ts materializeCanonicalGraphFlow` (the failing path), and
- `flows/graph-patch.ts applyFlowGraphPatch`, which rebuilds the document from
  the same snapshot and then validates it through `saveFlowInternal`. It had the
  same latent failure for any unpinned node; no test covered it.

#### (b) The proposal review reconciled from a stale read

`reviewRecordingFlowProposal` saved the graph Flow and then reconciled the
canonical graph from `await this.getFlow(...)` — which returns the canonical
graph, the very thing being replaced. On a first approval the graph had no
revisions, so the read returned the saved document and the import was correct.
On a **second** approval the read returned the previous nodes and wrote them
straight back, so the reapplied node never landed and the label stayed
`"Edited click proposal"`.

Fixed by reconciling from the document `saveFlow` returned. `service.ts` is at
its frozen 800-line-rule baseline (6919), so the explanation lives as a comment
on `replaceFlowGraphIndex` in `store.ts` and the call site changed by net zero
lines.

#### (c) A plain `saveFlow` never reached the canonical graph

With (a) and (b) fixed, the first test failed further on, at the guard that must
refuse to replace a Subflow a user has edited. The cause is the general form of
the same fault: `saveFlowInternal` wrote the document, the source file, the
config artifact and the SQL metadata, but never the canonical graph. So a user's
edit through `saveFlow` — here a label change, recorded with `manualProvenance` —
was invisible to the next `getFlow`, and `recordingProposalReplacementBase` saw
an unedited graph.

Fixed with `AutomationStudioFlowStore.reconcileCanonicalGraphFromDocument`,
called from `saveFlowInternal`. It deliberately does nothing in two cases:

- the Flow has no graph revisions (`materializeCanonicalGraphFlow` returns the
  same reference), so the document remains the only store of its graph; and
- the graph is unchanged (`stableJson` compare of nodes and edges), because
  every replacement is a new revision and an editor holds a revision as the base
  of its next patch. Without this skip, any metadata-only save would invalidate
  a concurrent editor's base revision.

The `graph-patch` path passes a document built from the snapshot, so it compares
equal and skips.

### 4. `service-subflow-pagination` — seeded once, copied per test

**The brief's premise needs correcting: there is no shared `global.sqlite`.**
Each one lives under the test's own `mkdtemp` data directory at
`projects/<id>/runtime/sqlite/global.sqlite`. The `EBUSY` was a cascade: when a
body times out, vitest runs `afterEach` while the body keeps writing, so the
cleanup `rm` hits a file still in use.

**Measured cause.** Writing one subflow through the service costs about 300 ms
on an idle machine, and the cost is flat, not quadratic — a timing probe over 64
subflows, in buckets of eight, gave create 288, 324, 317, 243, 211, 187, 171,
192 ms and save 143 … 84 ms, totalling 22.6 s. So the 32-subflow case spent
about 11 s of its 15 s default budget and the 64-subflow case about 21 s of its
30 s. Ordinary suite load pushed both over, and the timeout produced the EBUSY.

**Fix.** The inventories are written once in `beforeAll`, snapshotted after each
count the cases need (2, 3, 32, 64), and each case runs on its own copy — a
private database per test, and a body that only spends time on the listing it
asserts on. Every assertion is unchanged. The explicit 30 s budget on the
hydration case was **removed**, not raised: its body no longer seeds, so it runs
inside the default 15 s.

Before adopting this I probed that it is sound: a closed data directory copies
with **no embedded seed path**, 44 files for 8 subflows, copy 69 ms, and a
service opened on the copy lists all 8. `migrationQueues`, the only module-level
map in storage, is keyed by database file path, so copies cannot share one.

Result: bodies now take at most 2.6 s; the file alone runs 5/5 in 25 s, and both
cases passed inside the full repo run (416 ms and 2578 ms).

## Mutation checks: the rewritten tests still discriminate

Passing after a rewrite proves nothing on its own, so I broke the behaviour in a
scratch copy and confirmed each test fails.

| Mutation | Result |
| --- | --- |
| `SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY` 16 → 64 | `bounds concurrent detail hydration` **fails**: "expected 64 to be less than or equal to 16" |
| completeness guard `>=` → `>` alone | still passes — see below |
| completeness guard **and** the `ensureFlowSubflowSummaryIndex` early return | `does not hydrate a stale legacy index` **fails**: "expected 32 to be +0" |

The middle row is worth recording: that test pins a **pair** of guards, not
either one alone. Breaking only the typed-projection completeness check sends the
call to the fallback SQL query, which still answers from the summary rows without
hydrating any detail. Both guards must fail before the stale legacy index is
hydrated.

Both mutations were applied only in a scratch copy. The working tree was never
mutated, verified afterwards with `git diff` over `summaries/`.

## Commands run and observed results

All from `F:\!FluxIQ` unless noted.

- `pnpm --filter fluxiq check` (`tsc --noEmit`): **exit 0**, twice.
- `pnpm check` (repo): **exit 0** —
  `structure-audit: passed (118 warning(s), 256 baselined).`, and
  `packages/contracts`, `packages/client-gateway-websocket`, `packages/fluxiq`,
  `apps/web` each `check: Done`.
- Structure audit, first attempt after my `service.ts` edit: **FAIL**,
  `service.ts: 6922 lines … Baseline for this entry is 6919; baselined entries
  may shrink, never grow.` I moved the comment out and the audit passed.
- Targeted tests, before: 3 failed (the brief's three).
  After: `runtime-llm-grants` 1 passed; `service.test.ts -t` the two names,
  `Tests 2 passed | 106 skipped (108)`.
- `service-subflow-pagination.test.ts` alone: `Tests 5 passed (5)`, 25.4 s;
  slowest body 2234 ms.
- `pnpm --filter fluxiq test`, run 1: `Test Files 1 failed | 126 passed (127)`,
  `Tests 1 failed | 827 passed (828)`, 145.5 s.
- `pnpm --filter fluxiq test`, run 2: identical counts, 145.6 s. Same single
  failure both times.
- `pnpm test` (repo): contracts `Tests 7 passed (7)`; client-gateway-websocket
  `Tests 3 passed (3)`; fluxiq `Tests 1 failed | 827 passed (828)`; then
  `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, so `apps/web` did not run.
- Bisect copies (`git archive` + junctioned `node_modules`): `5361951` grant test
  1 failed; `0271d60~1` the two service tests 2 passed; `0271d60` 2 failed.

## The one failure I did not fix

`storage/project/tests/runtime-stream-store.test.ts > tails and reconnects
runtime streams by sequence at a million events`: `Test timed out in 60000ms`,
then `EBUSY … project.sqlite-wal`. It is outside my owned paths, and it is not
caused by any change in this work:

| Tree | Location of the test's `.tmp` | Result |
| --- | --- | --- |
| pristine `HEAD` copy | `C:` scratch | **pass, 17.9 s** |
| **working tree code copied verbatim** | `C:` scratch | **pass, 17.2 s** |
| working tree | `F:\!FluxIQ\packages\fluxiq\.tmp` | fail, 62.2 s (alone, cleared `.tmp`) |
| working tree | same | fail, 66–67 s, twice more |

The same code passes on one drive and times out on the other, so the cause is
where the test writes, not what it computes. The test uses
`path.join(process.cwd(), ".tmp", …)` — a fixed path inside the repository
rather than an OS temp directory. Consequences: it is bound to the project
drive's speed, it leaves state behind (I found 275 MB, including a 158 MB
`project.sqlite`, and cleared it once no run was live), and two concurrent
fluxiq suites would collide on that one path. `core-failure-taxonomy` saw this
test pass on `F:` earlier today, so the budget is marginal rather than broken.

Suggested owner fix: `mkdtemp` under the OS temp root per run, and a budget
matched to the machine.

## Not verified

- **`apps/web` tests.** The repo run aborts at the first failing package, so it
  never reached them. `core-web-test-health` owns them; I quote no counts.
- **`pnpm build` and `pnpm docs:reference`** were not run; neither is in this
  brief's definition of done. `pnpm docs:check` was already failing before this
  work (recorded in `core-failure-taxonomy.md`).
- **Live browser or web-panel validation.** Core has no browser surface here,
  and the reconcile-on-save change is covered by 827 passing tests but not by a
  live editing session.
- **Concurrency semantics of the new reconcile** against a real editor holding a
  base revision. The unchanged-graph skip exists precisely to preserve them, and
  the graph-patch path is covered by the suite, but no test exercises a
  simultaneous monolithic save and graph patch.
- **Whether the stream-store test passes on `F:` at other times.** It did for
  another worker earlier today; I only measured it failing there now.

## Open questions or contradictions found

1. **"EBUSY on a shared `global.sqlite`" (brief).** Not shared — one per test
   `mkdtemp` directory. The EBUSY is a timeout cascade, and the timeout came
   from ~300 ms-per-subflow setup inside the test body.
2. **Test locations (brief).** The two failing cases are in
   `programs/automation-studio/runtime/tests/service.test.ts`, not
   `runtime/tests/service.test.ts` (which exists and is a different file).
3. **`saveFlow` now writes through to the canonical graph.** This restores
   pre-`0271d60` behaviour, and the tests encode it: an edit made through
   `saveFlow` must stick. If Core instead intends monolithic saves to be
   *refused* for Flows with graph revisions, forcing clients onto graph patches,
   that is a product/API decision and this fix would be replaced by a rejection.
   Silent loss of the write is not a defensible third option, which is why I
   treated it as a defect rather than a decision.
4. **`graph-patch.ts` carried the same `"legacy"` fault** with no test covering
   it. It is fixed by the shared converter, but a test for a patch against an
   unpinned node would be worth adding.
5. **The stream-store test's fixed in-repo `.tmp` path** (item above) is a
   test-isolation defect in a file I do not own.
