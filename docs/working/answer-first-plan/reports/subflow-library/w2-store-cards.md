# w2: the parts library store, cards, trust and the save

Outcome: Done. Everything in A to F exists and passes its checks. Nothing committed. Three things the lead must wire or decide are listed at the end.

## What exists (all under `packages/fluxiq/src`)

**A. Store.** `framework/persistence/automation/project/parts/` (`store.ts`, `types.ts`, `rows.ts`, `query.ts`, `search-text.ts`, `cursor.ts`, `migration.ts`, `index.ts`, re-exported from `project/index.ts`). Tables `project_parts`, `project_part_versions` (immutable by triggers), `project_part_facets`, `part_calls`, `project_part_runs`, `project_parts_fts`. The migration is in the administration list.

**B. Card.** `runtime/project-parts/card/`: `deriveAutomationStudioPartCard` and its helpers (steps, words, origins, ports, fixed values, lasting classes, start and end checks, shape hash).

**C. Trust.** `runtime/project-parts/trust/`: `deriveAutomationStudioPartTrust`, `completeAutomationStudioPartCard`, and two evidence adapters (judgement rows, part runs).

**D. Save.** `framework/automation-service/service/project-parts/save-applied-flow.ts`, plus `part-id.ts` and `call-order.ts`. `service.ts` is untouched.

**E. Stability.** The `stability` field was already optional on the type. I stopped `context-packet.ts` reading it (the `Pick` and the spread), dropped the init in `service/flows/mutations.ts`, and corrected the doc paragraph in `docs/architecture/automation-studio.md`.

**F. Tests.** `card/tests/derive-card.test.ts` (12), `trust/tests/derive-trust.test.ts` (9), `parts/tests/store.test.ts` (7), `project-parts/tests/save-applied-flow.test.ts` (9), one added case in `project/tests/graph-judgement-store.test.ts`. Shared fixture: `runtime/project-parts/tests/fixtures.ts`.

## Decisions I took

1. **Migration ids are `0026_sa_project_parts` and `0026_sb_flow_graph_judgement_zero_model`, not 0037 and 0038.** Every store appends its own migrations (`0026_staged...` up to `0036_object_pending_removal_paths`) after the administration list and the runner demands ascending ids. My first ids (0037, 0038) broke every content-store open ("unique, ascending IDs"). The precedent is `0026_responded_turn_decision`. The project-parts migration sits in `parts/migration.ts` and administration imports that leaf directly (a barrel import would cycle). The `directory-files` cap and the depth cap left no room in `schema/`. The zero-model migration is appended in `schema/graph-judgements.ts`.
2. **Trust is not stored.** `card_json` is the contract card without `trust`. Read with `completeAutomationStudioPartCard(stored, evidence)`, which parses with a placeholder, derives trust from `lastingClasses` and the evidence, and parses again.
3. **Zero-model column added.** `flow_graph_judgements.zero_model` (default 0 = asked). The judgement store's `record` takes `zeroModel?` and rows return `zeroModel`. `recordAutomationStudioFlowGraphJudgements` takes `zeroModel?` beside `judgement`. How to know: `automationStudioResultRecordOnRunDetail` already returns `askedNoModel` (run-record.ts), computed BEFORE the judgement write in `run-outcome.ts` (line ~346 vs 356).
4. **Snapshot goes through the content store, unowned, before the transaction.** The object reference is inserted inside the one transaction, so a failed write leaves an unreferenced object (swept) and no row in any table. The store's `writeVersion` re-checks the shape hash inside the transaction (dedupe is atomic) and assigns the version itself.
5. **Snapshot** = `{ schemaVersion: "automation-studio.project-part.v1", graph, start: {source, conditions, selfArrives?}, end: {conditions} }` in the one content object. Start and end conditions live there, the card holds `{digest, conditions, says}`.
6. **Shape hash dedupe scope** is the project. A copy of a part from another Flow with the same shape returns `status: "existing"` pointing at the first part, and callers call that one.
7. **Domain-neutral derivation.** The structure audit's web-vocabulary rule refuses `selector`, `visibleText`, `xpath` etc. in Core. So the card input takes `controlParameterKeys` (default `["target"]`) and `targetWords(target)` from the domain, as the checked rerun already takes `controlParameterKeys`. The shape hash includes the whole target object minus `bounds, candidates, selectedCandidate, source, metadata`.
8. **Words screening** uses the contract's own parser as the screen (the checker `isPersonWords` is internal to the contract).
9. **Fail closed lasting.** A step that acts (any non-`builtin.` node, `builtin.policy.action`, call-subflow) with no `declaredConsequences` array is `part.unclassified_step`; an unknown class is `part.unreadable_consequences`; a marked-lasting step with `[]` is `part.unclassified_step`; an unresolvable call is `part.unresolved_call`.
10. A flow-graph caller that is not itself kept as a part (the primary) has its calls recorded as `flow_graph` rows in `part_calls`.

## Commands run and observed

From `packages/fluxiq`:
- `pnpm.cmd exec vitest run src/framework/persistence/automation/project/parts src/runtime/project-parts src/framework/automation-service/service/project-parts --minWorkers 1 --maxWorkers 2` -> Test Files 4 passed, Tests 37 passed.
- `pnpm.cmd exec vitest run src/framework/persistence/automation/project/schema/tests src/.../tests/graph-judgement-store.test.ts src/.../tests/administration.test.ts --minWorkers 1 --maxWorkers 2` -> 9 files, 30 tests passed.
- `pnpm.cmd --filter fluxiq check` (from the repo root) -> exit 0, no errors printed.
- `node scripts/structure-audit.mjs` (repo root) -> exit 0. Before the fixes it failed on two directory file counts (schema, project tests), the 9-segment depth limit, and web vocabulary. All four resolved without touching the baseline.

## Not verified

- The save was never run from the real service: `service.ts` does not call it yet. No live or browser use.
- Whether real built part graphs carry `declaredConsequences` on their read steps. If they do not, many parts will be skipped `part.unclassified_step`. Check on the first real save (log `skipped`).
- `targetWords` has no web implementation yet, so with the default no control text is listed or compared: the `part.fixed_value_from_request` refusal covers typed literals only until the extension supplies it.
- The full package suite was not run (the brief forbids it).

## Open questions for the lead

1. **Wire the zero-model flag.** In `runtime/result-verification/run-outcome.ts` (~line 356) the `recordFlowGraphJudgements` port call needs `askedNoModel` from the `record` just above it, passed as `zeroModel` through the port to `recordAutomationStudioFlowGraphJudgements`. I did not edit `run-outcome.ts` or the port type (not owned). Until then every row reads `zeroModel: false`, so no part can reach `established` by judgement rows (part-run rows work already).
2. **Wire the save.** Call `saveProjectPartsOfAppliedFlow` from the service after a Flow is applied, passing `words` by Subflow id and `startLocation`.
3. `runtime/flow-authoring/bootstrap/adaptation.ts` lines 265 still writes `stability: { runCount: 0, ... }` (left alone as instructed). Also `framework/automation-service/service/flows/store.ts:621`, `framework/automation-service/service.ts:3156`, `flows/authoring/model/validation/adaptation.ts:66-70` and `apps/web/.../SubflowSettingsView.tsx` still touch `stability`.

## Exact signatures the next lanes use

```ts
// framework/persistence/automation (barrel)
AutomationStudioProjectPartStore.open({ pool, projectId }): Promise<Store>; store.close()
store.writeVersion(w: AutomationStudioProjectPartWrite): Promise<{ status: "created"|"new_version"|"existing"; part; version }>
store.getPart(partId); store.getVersion(partId, version); store.listVersions(partId)
store.findByShapeHash(shapeHash, preferPartId?)
store.query({ text?, site?, input?, output?, lasting?, callerFlowId?, sourceFlowId?, limit?, cursor? }): Promise<{ items: {part, version}[]; nextCursor; hasMore }>
store.readSnapshot(partId, version): Promise<unknown>   // AutomationStudioPartSnapshot
store.recordFlowGraphCall({ flowId, nodeId, partId, version }); store.listCallsTo({ partId, version? })
store.recordRun({ partId, version, runId, outcome: "succeeded"|"failed"|"stopped", modelCalls, finishedAtMs }); store.listRuns({ partId, version })
AutomationStudioProjectFlowGraphJudgementStore.record({ ..., zeroModel? }); rows carry zeroModel

// runtime/project-parts (barrel)
deriveAutomationStudioPartCard(input: AutomationStudioPartCardInput): { card, snapshot, searchable, facets, callSites } | { skipped: reason; detail? }
completeAutomationStudioPartCard(stored: unknown, evidence): { ok: true; card } | { ok: false; issues }
deriveAutomationStudioPartTrust({ evidence, lastingClasses })
automationStudioPartTrustEvidenceFromJudgements(rows) / ...FromRuns(rows)

// framework/automation-service/service/project-parts
saveProjectPartsOfAppliedFlow({ pool, projectId, flowId, subflows: [{ subflow, graphFlow, explicit?, sourceGraphRevision? }], requestWords, words?: Record<subflowId, {name?, purpose?}>, startLocation?, now? })
  : Promise<{ saved: {subflowId, partId, version, status}[]; skipped: {subflowId, reason, detail?}[] }>
```

Skip reasons (stable): `part.name_unusable, part.port_unusable, part.contract_unreadable, part.no_acting_step, part.fixed_value_unusable, part.secret_shaped_value, part.fixed_value_from_request, part.unclassified_step, part.unreadable_consequences, part.unresolved_call, part.card_invalid, part.primary_not_explicit, part.call_cycle`.

Card query note: `store.query` returns the newest version; the FTS index holds only the newest version per part.
