# Down saved-example failures: missing evidence-resolution phase

Outcome: Done (read-only root-cause discovery). Test/production source remains frozen. No checks, builds, browsers, providers or git operations ran.

## Cause and distance travelled

The lead's `test-runs/t831-unit3-down-tests.log` shows the authored examples parse/accept, their graph assertions and byte/schema pins pass, but all eleven save cases fail before normalization. The plan validator reports missing concrete `selector` and missing `extractList.item`/`extractList.fields`. Two saved topology follow-ons then lack topology. This is caused by the new test helper validating the raw authored handle plan; it omits the production resolution phase. No product defect is evidenced by these failures.

## Exact production path

Core paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`:

1. `flow-bootstrap/candidate/submission.ts:207` calls `checkAutomationStudioFlowBootstrapCompletion` with `handleReach: "view_history"`.
2. `llm/harness-options/bootstrap-completion.ts:442` calls `resolveAutomationStudioFlowBootstrapPlanParameters` after accepting/parsing the script and before validation; supplies registry, project/Flow ids, runtime binding, `handlesIssued: true`, permission check, and model-authorship flag.
3. `llm/harness-options/plan-parameter-resolution.ts:218` clones the plan, resolves fact targets first (entry/handler/checkpoint/success checks), then nodes. It delegates to `binding.resolvePlanNodeParameters`, refuses unresolved handles, preserves proper state bindings and records the resolved parameters.
4. `bootstrap-completion.ts:460` validates `resolved.plan`, not the raw authored plan. Only the validated build plan proceeds to saved graph normalization.

Down paths are under `domain/src/runtime/llm-evidence/`:

- `tools.ts` owns actual target/extraction stores and supplies `resolvePlanNodeParameters` through `resolveWebPlanNodeParameters`.
- `plan-resolution/resolve-plan-node.ts` documents and implements target-handle to concrete selector/element conversion, extraction-handle to detected item/fields request conversion, and next-page resolution from the same detected list.
- `plan-resolution/extraction/slot.ts` resolves an extraction handle against the actual extraction store; builds `{ item: binding.extractList.item, fields: ... }` and preserves authored where/sort/bounds through their proper readers.
- `structure/handles.ts` deliberately makes `extraction.N` meaningless without its retained detection. Likewise `target-packets.ts` requires captured evidence for `tN`. Empty fresh stores cannot resolve the sample scripts honestly.

## Public seams and minimal honest test setup

Core's `resolveAutomationStudioFlowBootstrapPlanParameters` is already publicly exported: `llm/harness-options/index.ts:70` -> `llm/index.ts:93` -> runtime/public automation-studio barrels. No new export or private import is needed.

Down owning barrels already export `createWebLlmTargetPackets` and `resolveWebPlanNodeParameters` (`plan-resolution/index.ts`), `createWebLlmExtractionHandles` (`structure/index.ts`), and `sanitizeWebLlmSnapshotWithBindings` (`sanitize` and llm-evidence barrel).

Minimal fix is test-owned, per-example evidence manifests plus real resolution before the existing strict save sequence:

1. Define explicit synthetic unit snapshot/detection fixtures for the authored sample page/control/list semantics. Each manifest maps its `tN` to a concrete element of the correct kind (button, text field, select, stateful choice, read target) and its `extraction.N` to a real item selector, actual named fields and the page continuation required by that example. Do not derive evidence solely by scanning script parameters, or share contradictory handle identities between unrelated examples.
2. Seed the real stores: sanitize fixture snapshots, `targets.remember(scope, binding)`, reserve/retain each detection in real extraction stores, preserving token order. Existing owning tests demonstrate these exact stores. Alternatively use actual `createWebAutomationLlmEvidenceRuntime` inspect/detect tools over a stub capture gateway; that takes more setup but also uses production token issuance. Neither approach opens a browser or calls a provider.
3. Call public Core `resolveAutomationStudioFlowBootstrapPlanParameters` on the accepted raw plan with `handlesIssued: true`, `handleReach: "view_history"`, `writtenByModel: true`, actual registry, and a binding delegating to the real Down resolver and seeded stores. A deterministic unit permission check may grant the scripted declared consequences; it authorizes no real action. Assert resolution succeeds and leaves no unresolved handles.
4. Run the unchanged strict plan validator -> normalizer -> per-graph validator on the resolved plan. Keep actual definitions and every existing graph/schema/router/role/requirement oracle.

Original authored-plan graph assertions should remain on raw plans. The saved-entry and saved-success-check assertions currently expect `{handle: "t6"}` / `{handle: "t11"}` to survive saving, which production intentionally resolves to concrete target identities. Preserve the original handle expectations on the authored plan (already covered), then assert the saved targets equal the explicit manifest's expected concrete identity. This is needed to model the real boundary faithfully, not to relax a validator or accept a wrong target. The lead should approve this test expectation adaptation as part of the correction brief; no test source changed during discovery.

Do not make selector optional, omit schema validation, fake registry capabilities, invent a resolver returning arbitrary filled parameters, copy unrelated Core fixtures, change examples/pins, or skip cases. Actual real resolver fixtures may expose further control-kind/column mismatches; those must be investigated individually.

Validation: not run; read-only assignment. Inspected lead log and actual owning production/test source only.
Not verified: proposed fixture manifests, resolution success for all eleven, subsequent strict save validation or checks.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit3-down-save-root-cause.md
