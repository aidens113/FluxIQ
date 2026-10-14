# t555 A12 assembly dataset ids (worker t555-a12-dataset-ids)

## Outcome

Done.

## What changed and why

How the ids come about (found first, as the brief asked):
- A record output with no dataset id written gets one from authoring
  (`flow-bootstrap/authoring/record-output.ts` `derivedDatasetId`): the slug of
  its name, a dash, and the step's id.
- With no draft step id, that step id is `${subflowKey}-${nodeKey}`
  (`flow-bootstrap/authoring/assemble.ts:618`). So a helper `narrow` with a read
  step `s1` ends up as `<name>-narrow-s1`, and two builders that both write a
  helper `narrow` save to the same dataset.
- Flow node ids already include the subflow key
  (`adaptation.ts:219`, `node.bootstrap.<ns>.<subflowKey>.<nodeKey>`), and plan
  validation only requires node keys to be unique within a subflow. So the
  "step id" that can collide across subflows is the authoring step id
  `<subflowKey>-<nodeKey>`.

`flow-bootstrap/subflow-candidate/part-keys.ts`:
- New export `automationStudioSubflowStepId(subflowKey, nodeKey)`, which builds
  that step id.
- `automationStudioSubflowRekeyedParts` now also renames a helper part's
  derived dataset ids. Any top-level parameter that is an object naming a
  `datasetId` (found by its shape, as `result-verification/build-test/stores.ts`
  does) and whose id ends in `-<oldPartKey>-<nodeKey>` gets that ending
  replaced with `-<newPartKey>-<nodeKey>`. For example, `titles-narrow-s1`
  becomes `titles-find-narrow-s1`. The name part is cut short if needed to keep
  the id within the 200-character record-set limit.
- Dataset ids the model wrote itself are left alone. So are the target's ids:
  the target's key is already the scope's own key.

`project-agents/supervisor/assembly.ts`:
- After the existing key-collision check, a new `sharedIds` pass tracks which
  brief each assembled subflow came from (the proposal's `scope.briefId`, or
  "the calls assembly wrote" for the subflow assembly composed).
- It refuses a step id two briefs share with
  `project.assemble_step_id_collision`, and a dataset id two briefs share with
  `project.assemble_dataset_id_collision`. Each message names both briefs and
  their subflows. Repeats inside one brief are still allowed.
- The header doc is updated to match.

Tests:
- `part-keys.test.ts` gains two cases. One checks that a derived id is renamed
  while a written id, a non-matching id and the target's id are not. The other
  checks the 200-character limit.
- `assembly.test.ts` gains a `step and dataset ids across briefs` block with
  four cases:
  - two briefs that both name a helper `narrow` with a read step assemble with
    distinct step ids and the datasets `titles-find-narrow-s1` and
    `titles-hold-narrow-s1`;
  - a written dataset id both briefs share is refused, naming `brief-find` and
    `brief-hold`;
  - a forced step-id clash (`find-x-s1`) is refused, naming both briefs;
  - one brief's own subflows may share a dataset.

## Commands run and observed results

- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests src/programs/automation-studio/runtime/project-agents/supervisor/tests`
  (from `packages/fluxiq`) -> `Test Files 12 passed (12)`, `Tests 60 passed (60)`.
- `pnpm.cmd --filter fluxiq check`:
  - first run: TS18046 errors, because `subflow` was inferred as `unknown` in
    the new `sourced` flatMap;
  - fixed with `flatMap<Sourced>`;
  - re-run: no errors (`"reason":"no stamp; stored in the shared store"`, exit 0).
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (350 warning(s), 1156 baselined).`
- `git diff --check` -> clean (only the usual LF->CRLF notice).

## Not verified

- Building contracts was not needed; the tests ran without it.
- No tests ran under `service/project-build/` or elsewhere outside the two
  owned test directories, and no full suite ran.
- No live or Lab run.

## Follow-up (supervisor, same task): rename the router-run target's derived ids

The supervisor asked for the router-run target's derived ids to be renamed,
not refused.

- `part-keys.ts`: `automationStudioSubflowRekeyedParts(target, parts, { targetWrittenKey })`.
  When the written key differs from `target.key`, the target's derived dataset
  ids get the same rename as a helper part's:
  `-<writtenKey>-<nodeKey>` becomes `-<target.key>-<nodeKey>`.
- `scoped-submission.ts:207`: passes `written.key` into re-keying, and the
  `proposalOf` doc comment is updated.
- Tests:
  - `part-keys.test.ts`: the target's ids are renamed with the option and left
    alone without it.
  - `scoped-submission.test.ts`: a real router-run script (entry written as
    `main`, a read step with `recordOutput.label/schema`) now yields
    `titles-find_listing-s2`. With the `scoped-submission.ts` change reverted
    temporarily, the same test produced `titles-main-s2`, which shows the
    change is what renames it.
  - `assembly.test.ts`: two router-run entries `by_author` and `by_shelf`, both
    written as `main`, assemble to `titles-by_author-s1` and
    `titles-by_shelf-s1`. The same pair without the rename is still refused
    with `project.assemble_dataset_id_collision`.
- The refusal for draft-based ids is kept as it was.

Follow-up commands:
- `pnpm.cmd exec vitest run .../subflow-candidate/tests .../project-agents/supervisor/tests .../service/project-build`
  -> `Test Files 18 passed (18)`, `Tests 81 passed (81)`.
- `pnpm.cmd --filter fluxiq check`:
  - first run: no errors;
  - re-run: reused the stamp, exit 0.
- `node scripts/structure-audit.mjs` -> `passed (350 warning(s), 1156 baselined)`.
- `git diff --check` -> clean.

## Open questions or contradictions found

(The router-run target item below is resolved by the follow-up above.)

- A dataset id derived from a **draft** step id (`step.id` or `p<position>`,
  used when the builder authored from a draft) does not contain the part key,
  so re-keying cannot recognise it and leaves it unchanged. Two briefs that
  derive the same draft-based id are refused at assembly with
  `project.assemble_dataset_id_collision`, not renamed. Removing this case
  would need the builder to pass a subflow-scoped step id into authoring.
- The same goes for a router-run target. `scoped-submission.ts` (not owned)
  replaces the entry's written key (for example `main`) with the scope key
  before re-keying, so its derived ids keep the written key. Two such briefs
  whose entries were both keyed `main` are refused at assembly, not renamed.
  Fixing it would mean passing the written key into
  `automationStudioSubflowRekeyedParts` from `scoped-submission.ts:207`.
- Datasets a domain derives while it runs, which never appear in the plan, are
  invisible to this check (as `stores.ts` already says).
