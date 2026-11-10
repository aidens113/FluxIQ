# P9-D: Flow version history and set_node_label

## Outcome
Done, except the fluxiq typecheck, which was not run (free memory 1.2-2.4 GB, below the 3000 MB rule).

## What changed and why
- `set_node_label` (graph-store.ts, api-contracts/automation/graph.ts): sets the label (trimmed, 1-200 chars); empty text or an unknown node is refused with a plain reason ("A step label cannot be empty." / the store's unknown-node error). Inverse puts the previous label back. The store never holds an empty label (an unlabelled step is stored as its node id), so the inverse of "no label" restores that id; no `clear` flag needed.
- `applyPatch` takes an optional `source` (default `editor_patch`); `restoreSnapshot` takes `authorId`/`message` and records source `snapshot_restore`.
- `flows/graph-patch.ts`: new `listFlowGraphRevisions`, `createFlowGraphSnapshot`, `restoreFlowGraphSnapshot`; canonical-Flow rewrite extracted to `rewriteCanonicalFlow` (shared by patch and restore). New `flows/graph-revision-entry.ts` maps a revision to `{ revisionNumber, madeBy (person|repair|assistant|system), madeByLabel ("A person", "FluxIQ repair", "The assistant", "FluxIQ"), message, createdAt, changeCount, snapshotSha256 }`. Adaptation authors map to repair, the importer to system with the message "First saved version".
- Decision: the store only snapshots the current graph, so an old version was not restorable. Before each patch or restore, `keepRestorePoint` snapshots the latest revision if it has none (best-effort, never blocks an edit). Every replaced version is then restorable; the newest has `snapshotSha256: null`. `create-graph-snapshot` refuses any revisionNumber other than the current one.
- `handlers/graph-revisions.ts` (new, registered in register.ts after the Flow endpoints): list (programs.read, read), create (flows.write, authoring), restore (flows.write, authoring, Write; same pattern as apply-graph-patch). Restore is a new revision. All three exposed to the assistant with schemas.
- apply-graph-patch stays declared hidden (editor-only); it now reads optional `madeBy` (person/repair/assistant) into the revision source. Its schema `applyGraphPatchInput` exists in contracts and accepts `set_node_label`.
- `service.ts`: `flowGraphPatch` made public (comment-only line change) so handlers call it directly; no methods added, because service.ts is at its structure baseline. flows.ts now calls `service.flowGraphPatch.applyFlowGraphPatch`.
- Contracts: `program-api/automation-studio/graph/{patch,revisions,index}.ts` plus tests.
- Files outside the strict ownership list that I touched: `service/flows/graph-patch.ts`, `graph-revision-entry.ts`, `flows/index.ts`, `service.ts` (1 line), `handlers/flows.ts` (madeBy), `register.ts`.

## Commands run and observed results
- `npx vitest run --pool=forks --poolOptions.forks.singleFork` over history tests, flows.test.ts, flows-assistant.test.ts, graph-store.test.ts, adaptation-store.test.ts: 57 passed, 1 failed (restore message wording); fixed, history rerun: Test Files 1 passed, Tests 2 passed.
- New graph-store tests: label set/inverse/refusals/conflict, and list+snapshot+restore over a 3-revision Flow (restore = revision 4): passed.
- New handler test (`handlers/tests/history/tests/graph-revisions.test.ts`): labels (assistant and person), undo via inverse, refusals, stale baseRevision gives `status: "conflict"`, list order/who/message/snapshots, restore as revision 6, snapshot of current only, minimal examples accepted: passed.
- contracts `npx vitest run src/program-api`: 11 files, 40 tests passed (before adding my 5 tests in graph/tests, which were included in that run: they ran in it).
- `node scripts/structure-audit.mjs`: "structure-audit: passed (535 warning(s), 1095 baselined)".

## Not verified
- fluxiq typecheck (memory). Exhaustive `op` switches elsewhere (e.g. outline-edit.ts) not type-checked for the new op.
- The IAM catalog (`actions.generated.ts`, read-only/destructive modules) and assistant-tools file were not regenerated: new actions `studio:ListGraphRevisions`, `studio:CreateGraphSnapshot`, `studio:RestoreGraphSnapshot` need the supervisor's regeneration; `live-registry.test.ts` will fail until then.
- Full parity test not run.

## Open questions
- Restore from the assistant records the author as unspecified (shown "A person"); the restore endpoint has no madeBy.
- Auto restore points store a JSON snapshot per saved version; large Flows will grow the content store (objects are content-addressed, identical states dedupe).
