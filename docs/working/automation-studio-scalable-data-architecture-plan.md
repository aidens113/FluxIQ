# Automation Studio Scalable Data Architecture Plan

Status: Paused
Status detail: Paused as a separate workstream during the approved data-first execution week; unresolved work and historical evidence are retained below.
Created: 2026-08-27
Last updated: 2026-11-22
Owner: FluxIQ framework / Automation Studio
Scope: Hybrid SQLite-plus-content-addressed storage for Automation Studio at very large scale: per-project typed schema, graph partitions/revisions/patches, bounded event streams, keyset APIs, browser query stores, push sync, explicit migration and cutover, and scale certification.
Paired document: none
Related: `automation-studio-data-flow-refactor-plan.md` and `automation-studio-load-performance-plan.md` (both superseded by this plan); `docs/operations/automation-studio-scale-certification.md`

---

## Current State

**Priority reconciliation, 2026-11-22:** [Data-first simplification](./data-first-simplification-plan.md) is the current implementation plan of record (approved S7). This pauses this separate plan, does not mark its remaining work complete, and does not cancel another running session. The earlier snapshot below is historical; its code and acceptance were not revalidated by this documentation change. Prior status detail: implementation complete through Phase 12 certification harness; full external certification evidence still required before release flag removal

**What is true now**

- The document's own status line (retained below this block): "implementation
  complete through Phase 12 certification harness; full external certification
  evidence still required before release flag removal".
- Every numbered step 0.1 through 12.8 in the Implementation Ledger is marked
  Done (120 rows including the initial audit). All rows are dated 2026-08-27
  except 4.2, dated 2026-09-01, which is the most recent dated entry. The final
  row's Next column reads "Complete".
- v2 storage (SQLite mutable control plane, content-addressed immutable
  objects, bounded event chunks) is implemented behind the
  `automation_studio_v2_storage` feature resolution and
  `migration_cutover_state` (11.6, 11.9). Per 12.8, scalable data-flow flags
  must remain until the certification report overall status is `passed`.
- Phase 12 delivered the certification harness (report schema, CLI, target
  manifest digest, hardware/config capture, evidence gates), not the evidence
  itself: "CLI emits a blocked template until real matrix evidence is
  attached" (12.1).
- Last recorded full validation (11.12): `pnpm docs:check` passes; root suite
  web 321/321, gateway 3/3, FluxIQ 457/457.

**Done** (by phase; per-step detail is in the Implementation Ledger)

- Phase 0: performance recorder with endpoint/SQL/browser telemetry, Data Flow
  Inspector, deterministic scale fixtures, `pnpm studio:baseline` legacy
  baselines (68.7 MB graph, 216.33 ms project parse, 137.36 ms save
  serialization at 100k nodes), ordinary-UI endpoint guardrails, Playwright
  retention scenario, published baseline report. Exit decision: pass for
  instrumentation and reproducibility, fail for the legacy architecture.
- Phase 1: `AutomationStudioProjectDatabasePool`, migration runner with
  checksums, schema lock, and backup hook, `catalog.sqlite` typed
  repositories, project administration/feed/outbox/job tables, domain tables,
  FK/index/FTS5/RTree migration, `AutomationStudioProjectUnitOfWork` with
  idempotent mutation records, query-plan tests, durability tests. Exit gate
  satisfied for empty v2 project databases.
- Phase 2: SQL `objects`/`object_references`, staged content store, versioned
  event chunks, spools with single-writer leases and recovery, sequence and
  time cursor reads, retention and mark-and-sweep, legacy `objects.json`
  importer, edge-case tests. Exit gate satisfied.
- Phase 3: legacy catalog importer, SQL hierarchy repository, cursor-paged
  child/ancestor/subtree/search, atomic hierarchy mutations, hierarchy feed,
  paged sidebar folders and tests, 100k-subflow fixture (about 3.0 s).
- Phase 4: SQL Flow metadata/settings/ports/variables/errors, subflows and
  categories with `graph_flow_id` preservation, Routers, instructions with
  effective-instruction cache, `adaptation_policies`, transactional
  mutations, `list-flow-metadata-page` / `get-flow-metadata-detail`, resource
  page store, authorization/conflict/cascade tests.
- Phase 5: `AutomationStudioProjectGraphRepository`, revision-1 import of
  monolithic Flows, RTree viewport reads, aggregates and boundary edges,
  idempotent `applyPatch`, overlap-aware rebase/conflict, inverses and history
  pages, content-addressed snapshots and restore, incremental validation jobs,
  normal-editor guard rejecting full Flow document graph writes, property
  tests, `measureAutomationStudioGraphStoreBenchmark` (smoke run only).
- Phase 6: normalized `GraphViewportStore` with LRU, initial viewport load,
  prefetch/cancellation/density states, stable entity identity, operation-batch
  undo/redo, IndexedDB operation drafts, graph worker task queue,
  revision-based signatures, MiniMap density, editor ownership split from
  `AutomationStudioLive`, Playwright graph DOM budgets.
- Phase 7: typed `runtime_runs` and `recordings` projections, runtime and
  recording event chunk streams, `list-flow-run-events` ordered stream view,
  `state_snapshots`/`state_paths` with object-backed bodies, tail and
  reconnect by sequence, chunk-manifest reads for new writes, million-event
  tests.
- Phase 8: `automation-studio.compiled-plan.v1`, background compile jobs,
  `AutomationStudioProjectCompiledPlanStore`, compile-time resolution of
  settings/instructions/dependencies, `startRunFromArtifact`, migration
  `0008_compiled_runtime_isolation` safe-point adoptions, digest LRU cache,
  deterministic replay tests, proof that post-load run start touches only
  `runtime_runs`.
- Phase 9: migration `0009_adaptation_evidence_revision_safety`,
  `AutomationStudioProjectAdaptationStore` with object-backed
  patches/prompts/responses/evidence, base revision bindings, application
  through graph patch transactions, policy gates, rebase/supersede/rollback
  and audit flows, independently paged Adaptations UI, high-volume tests.
- Phase 10: `list-project-change-feed` transport and browser sync client,
  gateway snapshot poll and project-context heartbeat replaced by event-driven
  refresh, cursor resume/backpressure/hidden-tab pause, scoped invalidation,
  post-mutation `refreshProjectRuntimeState()` removed (retained for project
  open and explicit refresh), decomposed scoped stores, leak and idle tests.
- Phase 11: inventory and verified backup manifests, resumable
  `legacy_resource_imports`, migration orchestration (graph split, stream
  chunking, object references), verification reports, hybrid-read
  diagnostics, new-project feature flag, fixture migration, cutover and
  rollback helpers, browser request-policy guard for legacy broad endpoints,
  retired read-time repair and active JSON indexes, updated legacy retirement
  runbook.
- Phase 12: certification report schema and CLI, plus evidence gates for the
  scale matrix, 24-hour soaks, crash injection, 1,000-switch heap retention,
  critical query plans and payload budgets, backup restore and compiled-plan
  replay, and feature-flag removal;
  `docs/operations/automation-studio-scale-certification.md` added and linked.

**Not done** (as stated by the document)

- No real certification evidence is attached for any Phase 12 gate: full scale
  matrix with hardware/configuration (12.1), 24-hour runtime/recording append
  and subscription soaks (12.2), crash-injection recovery runs (12.3), heap
  retention across 1,000 project/view switches (12.4), critical query-plan and
  payload evidence (12.5), backup restore and compiled-plan replay digests
  (12.6).
- Feature flags are not removed; 12.8 keeps removal blocked until every prior
  gate has passing evidence.
- The full 100k-node long graph benchmark "remains a certification-run input
  for Phase 12" (5.12); the full long soak "remains Phase 12 certification
  work" (11.8).
- Playwright browser execution for the retention scenario (0.6) and the graph
  DOM-count checks (6.11) was not run: "repository instructions prohibit
  starting the web panel in this work session".
- 4.2 records that "direct legacy-document projection, resolvable graph, and
  Router ordering remain explicit Phase 8 certification requirements".
- Compatibility paths remain: the client "compatibility bridge until graph
  patch APIs fully replace whole-flow save" (6.2), legacy draft fallback
  during cutover (6.6), legacy `timeline.jsonl` and flat-file fallbacks for
  unmigrated or no-store projects (7.5, 7.8), and Runtime Debug action rows
  still paged separately below the ordered stream (7.3).
- The Definition Of Done item "the full scale matrix passes latency, payload,
  memory, and durability gates" is therefore not yet met.

**Next steps**

- Run the certification workload on the reference machine and attach evidence
  for each Phase 12 gate so the certification report can reach overall status
  `passed`.
- Execute the Playwright scenarios (0.6, 6.11) in an environment where the web
  panel may be started, and capture the pending browser evidence.
- Only after the report passes, remove the scalable data-flow feature flags
  (12.8) and update release documentation.
- Keep the Implementation Ledger updated one row per step, per the document's
  own rule.

**Blockers**

- No external blocker is named. Certification gates report as blocked only
  because evidence has not been produced; browser evidence was blocked in the
  original work session by the instruction not to start the web panel.

---

Status: implementation complete through Phase 12 certification harness; full external certification evidence still required before release flag removal  
Created: 2026-08-27  
Owner: FluxIQ framework / Automation Studio


## Prior Plan And Unresolved Work

The [complete prior plan and ledger](./automation-studio-scalable-data-architecture-plan/archive/2026-11-22-prior-plan-and-ledger.md) are preserved, including unfinished phases and acceptance requirements. Relative links were rebased for the archive location; no prior technical claims were revalidated or marked complete. Resume from that reference when this separate workstream resumes.

## Work Ledger

### 2026-11-22: priority reconciliation and compaction

- Changed: paused this separate plan under approved data-first S7 and moved its oversized prior document to the linked archive; retained its existing state summary above.
- Validation: `node scripts/structure-audit.mjs --rule working-docs --update` initially refused the two-line growth of an oversized document; compaction applied, rerun passed (exit 0; four obsolete working-docs baseline entries removed).
- Remaining: all unresolved work in the archived plan; no product acceptance claimed.
