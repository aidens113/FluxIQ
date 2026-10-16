# t671 keep done work across amends: worker report (round two)

## Outcome

Done. Round two applies the supervisor's decisions on Q3 and Q4 on top of Core dev f05a486c. Both Lab amendments now carry the done work instead of dropping it: step 0055 (`run-mvan7giv`) and step 0099.

## What changed and why

**Round one (accepted).** The comparison and carry logic moved out of `supervisor/state.ts` into `project-agents/amendment/`, with a barrel and one export per file. It could not go under `supervisor/`: that folder is at the 25-file limit, and a subfolder would be past the 9-segment depth limit. Round one added:
- (a) narrowing: a done subflow whose amendment only removed outputs that no subflow of the new plan takes is carried on its own key;
- (b) merging: the coordinator's merge rule (`merged-into.ts`);
- (c) `changedParts` on dropped proposals.
All of these are carried, not kept done: assembly uses a proposal exactly as it was submitted.

**Q3: a part whose facts or lasting acts changed now carries.** This reverses t595.
- `amendment/part-change.ts` has a new kind, `acts`. It means the source and words are kept (same or reworded) but the lasting acts changed, possibly the facts too.
- In `subflow-change.ts`, a part the proposal was built for may be `same`, `reworded`, `facts` or `acts` and the proposal still carries. `"its facts changed"` joined the reasons a carry can follow. "Its parts changed" still fires for `acts`, which is accurate.
- `merged-into.ts` accepts the same part kinds, for consistency. The coordinator's earlier merge conditions said "same or reworded"; I extended them on the same soundness argument. Flagged below.
- Carried entries now hold `changedParts`, and the `because` sentence names each changed part.
- Header text updated in `state.ts` (t595 paragraph), `carried-proposals.ts` and `subflow-change.ts`.
- Tests updated, each with a comment saying t671 reversed them:
  - `tests/amend/tests/dispatch.test.ts`:
    - the predecessor-refusal case now drops on an added input instead;
    - "kept, carried and dropped" now carries `place_hold`, and `note_shelf` after it is still dropped;
    - the facts-changed case now carries.
  - `carries-proposal.test.ts`: the lasting-act case now carries.
  - `keeps-done-work.test.ts`: the 0055 shape now carries.

**Q4: the follow-ups.**
- `contracts/subflow-brief.ts`: `AutomationStudioProjectCarriedProposal` has three new optional fields, `removedOutputs`, `builtFor` and `routerRun: true`.
  - `readCarried` reads them, so a brief recorded before them still reads.
  - A `routerRun` that is not `true` is refused with `project.not_true`.
- `supervisor/dispatch-tool.ts` `carriedOnto` sets each field only when it applies. `builtFor` is set only when the key differs. So t658's carriedFrom equality still holds.
- New `amendment/carried-script.ts` (`automationStudioProjectCarriedScript`) rewrites the carried script so it fits the subflow it now belongs to. It changes only the carried subflow's own `part <key>:` block, ending at the `end` at the start of a line:
  - it removes the `output: <name>` lines one level in for removed outputs;
  - it renames the header to `part <subflowKey>:` when the key changed;
  - when the target is now router-run, it unwraps the part: it drops the header, its `input:`/`output:` lines and its `end`, and dedents by two spaces;
  - helper parts and handlers beside it are left as written;
  - a script whose header it cannot find is returned unchanged.
- `dispatch/run-brief.ts` `carriedOf` applies the rename of outputs (`renamedOutputs`) first, then this rewrite. It also shows `removedOutputs`, `builtFor` and `routerRun` beside the script.
- `CARRIED_NOTE` now says:
  - the script is already rewritten;
  - parts whose facts or lasting acts changed are judged again.
  The t658 phrases its test checks are kept.
- `supervisor/guidance.ts` `AMEND_PLAN` is short and generic, with no Lab wording. It says what is carried (more parts, changed facts or lasting acts, renamed, added or removed-and-unused outputs, a merge or rename that keeps the parts). It also says what is listed, including `because` and `changedParts`. `tests/guidance.test.ts` is updated, and its check for Lab words still passes.

**New tests.**
- `amendment/tests/carried-script.test.ts`: each rewrite (narrowing, rename, router-run unwrap) is submitted through the real `AutomationStudioSubflowScopedSubmissionController` of the subflow it now fits, and is taken. In the narrowing case the script before the rewrite is refused.
- `dispatch/tests/carried-opening.test.ts`: shows the new fields, the rewritten script and the note words.
- `contracts/tests/subflow-brief.test.ts`: parses the new fields and refuses a bad `routerRun`.

## Commands run and observed results

- Before any round-two edit, on f05a486c:
  - `pnpm check` (fluxiq tsc): no errors;
  - `npx vitest run src/.../project-agents`: 52 files, 374 tests passed.
- After the Q3 change, before the test updates: 8 tests failed. All 8 were the expected reversals listed above; I updated them.
- Final:
  - `pnpm check` in `packages/fluxiq`: no `error TS` (`"step":"fluxiq:check" ... stored in the shared store`);
  - `npx vitest run src/programs/automation-studio/runtime/project-agents`: `Test Files 53 passed (53)`, `Tests 380 passed (380)`;
  - `pnpm structure:check`: `structure-audit: passed (389 warning(s), 1156 baselined)`, no new warnings.

## Not verified

- No live Lab run.
- The rewrite assumes a part block closes with an `end` at the start of a line and that its own lines sit two spaces in, as the scope check's own scripts do. A builder script that indents differently is left as written, and the scope check then says what is missing.
- Neither the full suite nor the tests outside project-agents were run.

## Open questions or contradictions found

1. Merges now also accept built-for parts whose facts or lasting acts changed. This goes beyond the coordinator's earlier "same or reworded" condition, extended on the same reasoning as Q3. Revert in `merged-into.ts` (one line) if not wanted.
2. `supervisor/dispatch-order.ts` is not mine. A brief sent before its carried predecessor is rebuilt is told the predecessor "has no done proposal under this plan". It is not told that the predecessor was carried. The words are true but less specific than they could be.
3. The `run-brief.ts` file header (around :128-140) still describes only t658's carry. I did not edit it: my ownership there covers `carriedOf` and `CARRIED_NOTE` only.
