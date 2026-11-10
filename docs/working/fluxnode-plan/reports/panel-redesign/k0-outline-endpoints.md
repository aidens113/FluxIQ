# P9-K0: Flow outline endpoints

## Outcome
Done. fluxiq typecheck shows only an error in another worker's file (see below).

## What changed and why
- Contracts: `program-api/automation-studio/flows/outline.ts` (+ barrel line, test `flows/tests/outline.test.ts`): `getFlowOutlineInput`, `editFlowStepsInput` (`flowStepEdit` = the seven outline edit kinds by step number; optional `via: "assistant"`), `undoFlowEditInput` (reuses `graphPatchOperation`).
- Endpoint names `get-flow-outline`, `edit-flow-steps`, `undo-flow-edit` added to `api-contracts/automation/endpoints.ts` (outside my list; needed for the constants).
- Handlers: `handlers/` is at 27 files, so a new directory `programs/automation-studio/api/flow-outline/` (`register.ts`, `outline-of.ts`, `apply-steps.ts`, `edit-steps.ts`, `index.ts`, test), registered with one line (+ import) in `handlers/register.ts` after the graph revision endpoints.
  - `get-flow-outline` (read, exposed): `{ outline, revision, updatedAt }`. Outline built with the Flow's interface, router and callee names (Flow, subflow, saved part with lasting classes, FluxNode). A callee that cannot be read just shows without its name (declared best-effort in the catch). Plain Flows carry no lasting classes in storage, so only saved-part callees have them.
  - `edit-flow-steps` (authoring, exposed, contextArgs projectId/flowId): re-outlines at `baseRevision`, `outlineEdit`, then the same service path as apply-graph-patch with a fresh mutationId, source `assistant_patch` when `via: "assistant"` else `editor_patch`. Returns `{ ok: true, revision, inverseOperations, outline }`, `{ ok: false, reason }` (refused edit, nothing saved, or a version that does not exist), or `{ ok: false, conflict: { status, baseRevision, currentRevision, conflictingEntityIds, changedBy: [{revisionNumber, madeBy, madeByLabel, message, createdAt}], steps: ["2"] }, outline, revision }`. A stale base whose touched steps were not changed is saved on top (the store rebases), using the step numbers of the version the person edited.
  - `undo-flow-edit` (authoring, HIDDEN): it applies arbitrary graph operations, which would give the assistant a path around the outline's edits. The assistant undoes in words instead.
- `stepNumbers` context key is not used: `contextArgs` must map to top-level input fields and the step is nested in `edit`; the model reads the step number from the person's words.
- Root-cause fixes beside the module: `flowGraphPatch.readFlowGraph({ projectId, flowId, revision? })` (new, in `service/flows/graph-patch.ts`) returns the current graph or the graph at a kept version (every replaced version is kept by D's restore points; `graph` absent if not kept, which the edit treats as a conflict). `flowEdgeFromGraphRecord` extracted into `mapping.ts` and used by the canonical rewrite and the new read. `outlineFlatSteps` exported from `flows/executable/outline/index.ts` (the conflict answer needs it).

## Commands run and observed results
- `npx vitest run --pool=forks --poolOptions.forks.singleFork src/programs/automation-studio/api/flow-outline src/framework/automation-service/service/flows`: Test Files 3 passed, Tests 14 passed. The new file: get-flow-outline returns "1 Open the shop / 2 Search for a lamp / 3 Press Buy" at revision 2; edit renames step 2 (revision 3, inverse `set_node_label` old label, history shows `madeBy: assistant`), next outline shows it; stale baseRevision 2 gives conflict `{steps:["2"], changedBy:[{revisionNumber:3, madeByLabel:"The assistant"}]}`, saves nothing; an edit of step 3 on the stale base is saved as revision 4; refused edit (step 9) returns a reason and revision stays 2; baseRevision 40 refused; undo restores "Search for a lamp" (revision 4); minimal examples accepted; undo declared hidden.
- Same run with `src/flows/executable/outline` before the final refactor: 4 files, 27 tests passed.
- contracts `npx vitest run src/program-api`: Test Files 23 passed, Tests 64 passed.
- `node scripts/structure-audit.mjs`: "structure-audit: passed (539 warning(s), 1095 baselined)" (an earlier run showed one failure in `programs/_shared/press-grant/tests/...` that is another worker's and was gone on the rerun).
- fluxiq typecheck (3189 MB free, lock taken and released): one error, `src/programs/_shared/assistant/tests/declaration-hardening.test.ts(6,19): Cannot find module 'zod/v4'` (not my file). My two earlier errors (operation type, `flowId` in the literal) were fixed and gone.

## Not verified
- Generated catalogs not regenerated (supervisor does): new actions `studio:GetFlowOutline`, `studio:EditFlowSteps`, `studio:UndoFlowEdit` will fail `live-registry`/parity tests until then.
- Not run: the assistant parity test, apps/web typecheck, a real browser.
- Editing at a version that was not kept (restore point failed) answers as a conflict with no step list; not exercised in a test.
- A Flow's router and callees are read by the passed `flowId`; for a subflow graph Flow id the router is none.

## Open questions
- The panel passes the graph Flow's id (same as apply-graph-patch); the answer for a top-level orchestration Flow id is the outline of its own (empty) graph plus router routes.
