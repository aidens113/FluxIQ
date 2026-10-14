# t594 builder-scope-and-judge: worker report

Brief: builder-scope-and-judge (A8 launch 7 crossborder debug, fixes 1-4, 6 and 8). Core worktree
`fxwork/t594/!FluxIQ`, branch `task/t594-builder-scope-and-judge`. No model provider was called and
no live run was started.

## Outcome

Partial. All four items are implemented and each has a test. One part of fix 8 is not wired in: the
lasting-act check only runs when the brief's scope parts carry `lastingActs`, and the dispatcher that
builds the scope (`project-agents/dispatch/scope.ts`) is on this brief's must-not-touch list. It needs
one more line there (see Open questions). Candidate texts are unchanged: the candidate test sets pass
without edits.

## What changed and why

1. **The subflow judge sees the other parts as out of scope (fix 2).**
   - `service/project-build/task-checklist.ts`: `subflow()` now also returns `outOfScope`, which is the
     task spec's parts that are not in this brief, as `{id, words}`. It is left out when there are no
     other parts or no spec.
   - `result-verification/build-test/task-checklist.ts`: the checklist type has an optional
     `outOfScope`. When it is non-empty, the section gets an `outOfScope` list and one more sentence
     after the unchanged label. That sentence says a step that does an outOfScope part, above all a
     lasting act, is outside this subflow, so the judge should answer no and name the step.
   - `result-verification/contracts.ts`: the optional field was added to `AutomationStudioResultTaskChecklist`.
   - A whole trial's section, and a subflow section with no other parts, stay byte for byte what they were.
2. **Two new submission refusals.**
   - `subflow.output_not_a_value` (fix 3), in the new file `flow-bootstrap/subflow-candidate/route-outputs.ts`,
     called from `scoped-submission.ts`. It refuses an interface output whose binding (`$node.<key>.<port>`
     in the accepted probe plan) names a port whose role is success or failure. The role comes from the
     node registry, or from the port id when the registry has no entry. The refusal offers t581's way
     out: end blocked and name the output.
     - I put it in its own module because adding it inline took `scoped-submission.ts` past the 400-line
       advisory (it is now 389 lines).
   - `subflow.lasting_act_missing` (fix 8), in `scoped-submission.ts`. If any scope part carries
     `lastingActs` and no step of the target or its called parts declares a consequence, the submission
     is refused.
     - It checks only that some act is declared, not which class. This matches how `asked-acts.ts`
       already treats act classes as separate model judgements.
     - It takes the place of `lasting_act_dropped` for that submission, so the two never fire together.
     - The new optional field `AutomationStudioSubflowScopePart.lastingActs` is in `contracts.ts`.
3. **A dependent builder whose part is already done (fix 1), in `builder-loop.ts`.**
   - When the scope has predecessors, `briefWords` (the `flow` input description, which has no length
     limit) now names them. It says that a part already shown as done where the subflow starts was done
     by one of them, and that the builder should then complete with
     `{"ended": "blocked", "reason": "<which part is already done, and which subflow did it>"}`.
   - Such a builder has nothing to submit. So `ended: "blocked"` is now accepted before anything was
     tried, but only when the scope has predecessors.
   - `partial`, and any builder with no predecessors, still get `subflow.ending_too_soon`.
   - The submit tool's own description (limited to 2,000 characters) is unchanged.
4. **The builder's repeat note, and the lift for an unknown handle.**
   - `llm/repeat-guard/candidate-feedback.ts` (fix 4): a repeat of `core.submit_subflow` or
     `core.test_subflow` is now answered in a builder's terms.
     - A refused submission sent again gets its issues and their fixes, as a candidate's would. There
       are separate notes for a refusal with no issues, an accepted submission, a handle never shown,
       a trial call, and the same answer to a look.
     - Every builder note ends with "end the brief instead: complete with {"ended": "blocked", ...}, so
       the plan can change" and with "end this brief where it stands".
     - None of them says "candidate", "ask the person" or "nothing tested".
     - The `core.submit_candidate` notes and the other candidate-mode notes are unchanged.
   - `llm/repeat-guard/outcomes.ts` (fix 6): a failed call also counts as `handleUnshown` when it was
     refused and its answer's `issueCodes`, or its issues' own `code`, match `<domain>.handle.unknown`
     with or without a `:<where>` suffix.
     - `unknown_field` and `unidentifiable` do not match.
     - So the identical submission is lifted once a later call on the same page answers with something
       new, for example the detect that creates the handle.
     - This applies to any tool, `core.submit_candidate` included. Only its `then.handleUnshown` flag
       changes; its instruction text does not.

Model-facing text uses no scenario words. The test examples are a library ("renew the loan") and an
archive ("open the archive index"), and the label scenario-word test now also covers the out-of-scope
sentence.

Tests added or changed:

- `flow-bootstrap/subflow-candidate/tests/scoped-submission.test.ts`:
  - output bound to `success` or `failed` is refused, while an output bound to a data value stands;
  - `lasting_act_missing` refuses, any declared class passes, and parts that ask for no act (or carry
    none) are asked nothing.
- `flow-bootstrap/subflow-candidate/tests/builder-ending.test.ts`:
  - a dependent builder's brief text, and its early blocked ending being accepted;
  - an early `partial` is still refused;
  - a builder with no predecessors is told nothing of this. The existing "too soon" case now uses a
    scope with no predecessors, because the fixture's default scope has `sign_in` as a predecessor.
- `llm/repeat-guard/tests/outcomes.test.ts`:
  - a submission refused on an unknown handle is lifted after a detect;
  - `unknown_field` and `unidentifiable` are not lifted.
- `llm/repeat-guard/tests/candidate-feedback.test.ts`:
  - the builder notes, with their issues and the way out;
  - the candidate notes keep their wording.
- `result-verification/build-test/tests/task-checklist.test.ts`:
  - the out-of-scope section's keys, sentence and list;
  - with no other parts, the section equals the whole trial's.
- `service/project-build/tests/project-build-task-checklist.test.ts`:
  - `outOfScope` is listed under a spec;
  - it is absent when the brief covers every part.

## Commands run and observed results

All from `fxwork/t594/!FluxIQ/packages/fluxiq` unless noted.

- `npx vitest run <runtime>/flow-bootstrap/subflow-candidate <runtime>/flow-bootstrap/candidate <runtime>/llm <runtime>/result-verification <runtime>/service/project-build`
  printed `Test Files 304 passed (304)`, `Tests 2862 passed (2862)`. This includes the candidate
  pin tests: `flow-bootstrap/candidate`, `llm/decision-handlers` candidate-repeat and refusal wording,
  and `llm/evidence-loop`.
- After moving the port check into `route-outputs.ts`:
  `npx vitest run <runtime>/flow-bootstrap/subflow-candidate` printed `Test Files 8 passed (8)`,
  `Tests 57 passed (57)`.
- `npx tsc --noEmit -p tsconfig.json` printed nothing, exit 0. I ran it before and after the move.
- `node scripts/structure-audit.mjs`, from the Core root, printed
  `structure-audit: passed (358 warning(s), 1156 baselined)`.
  - None of the warnings is new. `outcomes.ts` (534 lines) and `result-verification/contracts.ts`
    were already past the advisory limit; they grew by 23 and 6 lines.
- `git diff --stat` shows 15 modified files and 1 new file. Line endings were kept as they were (no
  whole-file rewrites).

## Not verified

- Live behaviour: no Lab run and no model was called. Whether a real judge answers no on an
  out-of-scope step, and whether a real dependent builder takes the early blocked exit, is untested.
- The lasting-act check on the real dispatch path: it is inert until `project-agents/dispatch/scope.ts`
  carries `lastingActs` (below).
- A builder's repeat of a tool other than `core.submit_subflow` or `core.test_subflow` (for example
  `core.run_node`) still gets the candidate note, "submit a corrected candidate, or ask the person".
  The repeat-guard can tell a builder apart only by tool id. Fixing this needs a builder flag passed
  from `llm/decision-handlers/refused-repeat.ts:48`, which is outside this brief.
- The returned blocked ending carrying the builder's last summary to the supervisor (fix 4's second
  half, `project-agents/dispatch/ending.ts`) was not in this brief and was not touched.

## Open questions or contradictions found

- **Fix 8 needs one line in a must-not-touch file.** `project-agents/dispatch/scope.ts:29` builds each
  scope part as `{ partId, sourceId, text }`. It should be
  `{ partId, sourceId: part.quote.sourceId, text: part.quote.text, lastingActs: [...part.lastingActs] }`.
  Until that line is added, `subflow.lasting_act_missing` never fires in a project build. The scope
  type had no lasting acts and the builder has no record access, so there was no way to do this inside
  the owned files.
- Fix 8 as specified would not have caught brief-1 in this run. Brief-1's part p1 asked for
  `create_new`, and its submission did declare `create_new` for the cart add. It catches brief-2 to
  brief-4, whose part asked for an act and declared none. Brief-1's overreach is left to the new
  out-of-scope judge sentence (fix 2).
- The early blocked ending lets a dependent builder end without trying anything. That is the point of
  fix 1, but a lazy builder could use it too. The supervisor still reads the reason.
- `subflow.input_unread` is returned before the plan-level checks run. So a submission with both an
  unread input and a success-port output is told about the output only on its next submission.
