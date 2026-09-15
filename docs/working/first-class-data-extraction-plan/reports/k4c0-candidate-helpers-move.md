# k4c0-candidate-helpers-move: K4c step 0, candidate helpers moved out of the service

## Outcome

Done. Three helper functions moved out of `service.ts` into their own module with no behaviour change:

- `recordingCandidateDefinition` turns an approved recording candidate into a node definition.
- `recordingCandidateParameters` builds that definition's parameter list.
- `materializeRecordingNode` turns a Flow node that names such a definition back into a `builtin.policy.action` node.

The characterization test was written first. It passed against the unmoved code and passes unchanged after the move. The moved function text is byte-identical to HEAD apart from the added `export` keyword. `service.ts` went from 6807 lines to 6759 (48 fewer).

The structure audit exits 1, but both failures are in files this brief does not own (see Open questions). No audit finding names a file I touched.

## What changed and why

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

- **`service/recordings/candidate-definitions.ts` (new).**
  - Holds the three functions, each now `export`ed. The bodies are byte-identical to HEAD `service.ts:5799-5844`.
  - Imports:
    - `JsonObject` from core;
    - `AutomationStudioNodeDefinition` from `nodes/`;
    - `recordingProposalDefinitionId` and the two proposal types from `../../recording-flow-proposal.ts`;
    - `compactJsonObject` from `../compact-json.ts`;
    - `recordingCandidateStateLinkMetadata` from `./proposal-candidates.ts`.
  - These follow the import style of the sibling module `proposal-candidates.ts`.
  - The file also carries a short module comment.
- **`service/recordings/index.ts`:** added `export * from "./candidate-definitions.ts";`.
- **`service.ts`** (this move only):
  - Deleted the three functions and the blank line after them (47 lines).
  - In the `./service/index.ts` import list, replaced `recordingCandidateStateLinkMetadata`, which only the moved code used, with `recordingCandidateDefinition, materializeRecordingNode`.
  - Removed `recordingProposalDefinitionId` from the `./recording-flow-proposal.ts` import, since only the moved code used it.
  - Did not import `recordingCandidateParameters`: after the move only `recordingCandidateDefinition` calls it, so `service.ts` has no use for it.
  - Net result: 2 lines added, 49 deleted.
- **`service/recordings/tests/candidate-definitions.test.ts` (new), 8 tests.**
  - *Written before the move; they call only `AutomationStudioService`, so they ran unchanged on both sides:*
    1. Approving a two-candidate proposal into public node definitions. `approvedDefinitions`, the review destination, and `listRecordingDerivedNodeDefinitions` must each equal a fully spelled-out expected value. One candidate has a label, description, and confirmation with a 250 ms timeout; the other has none of them.
    2. The same approval with private visibility.
    3. `runRuntimeSession` on an inline flow with three nodes: two naming the approved definitions, then one plain `builtin.policy.action`. It checks:
       - the exact output dispatches, where each definition's recorded payload replaces the node's own and the plain node keeps its own;
       - the exact confirmation waits: one wait on `clicked` with a 250 ms timeout, and none for the unconfirmed node.
  - *Added after the move, calling the functions directly (these could not exist before the move):*
    - A proposal with no domain gets global availability, and a candidate's state link is written into the definition's metadata, with no `screenshotRef` key.
    - A payload that is not an object becomes `{}`, and a confirmation gets an empty input id and a 5000 ms timeout by default.
    - A node naming no definition, or naming a non-recording definition, is returned as the same object.
    - A node naming a recording definition keeps its other parameter values and metadata, gains `recordingDefinitionId` and `recordingProposalId`, and gets the 5000 ms default.
    - A missing output id is dropped, and a confirmation whose input id is not a string produces no confirmation keys.

## Commands run and observed results

Each command was run alone.

1. **Before the move:** `pnpm exec vitest run src/programs/automation-studio/runtime/service/recordings/tests/candidate-definitions.test.ts --no-file-parallelism`, run from `packages/fluxiq`.
   - Result: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
2. **After the move, before the direct tests were added:** `pnpm exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`.
   - Result: `Test Files 2 passed (2)`, `Tests 9 passed (9)`: `candidate-definitions` 3, `proposal-candidates` 6.
3. **Textual proof that the move changed nothing:**
   - Saved HEAD `service.ts` lines 5799-5844 to a scratch file with `git show HEAD:... | sed -n '5799,5844p'`.
   - Took the new module's function text with `export ` stripped.
   - `diff` printed nothing, then `IDENTICAL: moved bodies match HEAD service.ts:5799-5844`.
4. **Remaining references and size of `service.ts`:**
   - `wc -l` gives `6759`.
   - `grep` finds the moved names only at the import (`:223`), the `recordingCandidateDefinition` call (`:2534`), and the two `materializeRecordingNode` calls (`:4725`, `:4731`).
   - `git diff --stat`: `service.ts | 50 +-----`, `recordings/index.ts | 1 +`.
5. **Final test run:** the same brief command as step 2, with the direct tests included.
   - Result: `Test Files 2 passed (2)`, `Tests 14 passed (14)`: `candidate-definitions` 8, `proposal-candidates` 6.
6. **Type check:** `pnpm --filter fluxiq check`, which runs `tsc --noEmit`.
   - Result: no diagnostics, `EXIT=0`.
7. **Structure audit:** `node scripts/structure-audit.mjs`, run twice with the same result. Exit code 1 with:
   - `FAIL [file-lines] packages/fluxiq/src/programs/identity-access/runtime/service.ts: 811 lines exceeds the 800-line limit.`
   - `FAIL [working-docs] docs/working/README.md is out of date with the documents' header blocks.`
   - `structure-audit: 1 baseline entries can be lowered.`
   - `2 violation(s) across 2 rule(s).`
   - Filtering the full output for `candidate-definitions`, `service/recordings/index`, and `automation-studio/runtime/service.ts` found nothing.

## Not verified

- **No mutation proof.** I did not deliberately break a moved function to watch the tests fail; the brief did not ask for one. The service tests compare complete expected values, and a node left unmaterialized would dispatch the wrong payload.
- **Direct tests only ran after the move.** The five direct tests could not run before it, because the functions were private to `service.ts`. What connects them to the original code is the byte-identical diff in step 3, not a run before the move.
- **Coverage limits of the service tests.** They cannot see node metadata merging, dropping of undefined values, the 5000 ms defaults, or global availability. Only the direct tests cover those.
- **Which baseline entry can be lowered.** The audit did not name it. It is most likely `file-lines` for `automation-studio/runtime/service.ts` (6807 to 6759). The service class's method count should stay at 223, since no class members moved.
- **Not run:** the wider test suite, the build, and `pnpm check` from the repository root.

## Open questions or contradictions found

- **Audit failures belong to other owners.** The two audit failures are in files this brief does not own:
  - `identity-access/runtime/service.ts` is owned by `k0-3-identity-access`, and is 811 lines against the 800 limit.
  - `docs/working/README.md` is a shared supervisor document, and its index needs regenerating.
  - Both were left untouched, as the brief requires.
- **Baseline ratchet.** Per K4c step 0, the supervisor should run `pnpm structure:baseline` after integrating this work to record the lower `service.ts` line count. This worker was forbidden from touching `.structure-baseline.json`. Note that the same command also regenerates `docs/working/README.md`.
- **Future edits to this test file.** K7 plans to extend this test file with a direct test that `materializeRecordingNode` carries `recordOutput`. The direct-call `describe` block at the end is where that belongs.
