# t650 invited-resend-admitted-once (worker report)

## Outcome

Done. The kept-condition refusal now carries a machine mark that the repeat
guard reads, and the guard lets the identical resend run once per key. The
resend reaches the submission controller and is accepted there, in the
whole-candidate loop and in the subflow builder loop. Two loop replays and
three guard tests fail without the guard change and pass with it.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

- `llm/repeat-guard/resend-admission.ts` (new): a focused module, exported
  from the barrel.
  - It exports the type `AutomationStudioLlmEvidenceResendInvitation` (`"accepted_once"`).
  - It exports `automationStudioLlmEvidenceResendAdmission()`, whose
    `admits(key, answer)` is true only when two things hold: the answer is
    the refusal's own JSON, with `ok: false` and `diagnostics.resend ===
    "accepted_once"`; and no resend was admitted under that key yet.
  - It reads only `diagnostics.resend`. It never reads a top-level `resend`,
    the model's input, or plain-text answers.
  - It names no build code, so it applies to any tool whose refusal carries
    the mark.
- `llm/repeat-guard/outcomes.ts`: a header paragraph naming
  `run-mva446jf-926a3c72`, plus one block in `recorded()` straight after the
  key is computed.
  - The block runs for a refused call that `admits` the resend. It deletes
    any outcome, unshown entry and awaiting entry under that key, and
    returns without recording a failure.
  - A second refusal under the same key falls through and is recorded as
    `failed`, exactly as before, which bounds the admission to one resend.
  - Every unmarked refusal follows the unchanged path.
- `llm/repeat-guard/index.ts`: exports the new module, and the barrel comment
  names it.
- `flow-bootstrap/candidate/submission.ts` `keptConditionRefusal`: the
  feedback gains `resend: "accepted_once" satisfies
  AutomationStudioLlmEvidenceResendInvitation`, with a type-only import, so
  no runtime import edge is added.
  - Core sets the mark, never from model text.
  - `automationStudioCandidateSubmissionRefusal` already puts `feedback` under
    `diagnostics`, and the evidence loop records `answer: JSON.stringify(value)`,
    so the mark reaches the guard with no change to `evidence-loop.ts`.
- `flow-bootstrap/subflow-candidate/scoped-submission.ts`: not changed.
  - The scoped controller passes the inner controller's refusal through.
    `asSent` replaces only string values equal to the probe script, so
    `"accepted_once"` survives.
  - The builder loop formats the refusal through the same
    `automationStudioCandidateSubmissionRefusal`. The subflow loop test shows
    the mark arriving.
- Tests:
  - `llm/repeat-guard/tests/resend-admission.test.ts` (new, 5 cases):
    - an invited resend is admitted once, and a second marked refusal is
      then `failed`;
    - an unmarked refusal (`candidate.loop_or_binding_refused`) and a wrong
      mark value are refused as before;
    - the mark is never read from the model's input, a top-level `resend` or
      plain text;
    - `core.submit_subflow` behaves the same, and another refused subflow
      call is still guarded;
    - admission is one per key (per page).
  - `flow-bootstrap/candidate/tests/kept-condition-drop.test.ts`: a new
    describe. A scripted model goes through
    `runAutomationStudioFlowCandidateAuthoringLoop` and the real evidence loop
    on one unchanged page:
    - look, submit (rev 1), trial no (kept conditions), look;
    - submit the drop, refused `kept_condition_dropped` with
      `diagnostics.resend: "accepted_once"`;
    - resend the same Flow, which comes back `ok: true, revision: 3`.
    - The `accepted` callback sees `[1, 3]`, and no `repeat_refused` appears
      in the evidence.
    - It was appended here because `candidate/tests/` is at the 25-file limit.
  - `flow-bootstrap/subflow-candidate/tests/kept-condition-drop.test.ts`: the
    same shape through `runAutomationStudioSubflowBuilderLoop`. It is accepted
    as proposal revision 3, and `accepted` sees `[1, 3]`.
  - Fixtures: the campsite search (`kept-condition-fixture.ts`). No words
    from a realistic scenario.

## Commands run and observed results

All `npx vitest` and `npx tsc` commands ran from `packages/fluxiq`, and the audit from the Core root.

- `npx vitest run .../llm/repeat-guard`: 9 files, 56 tests passed.
- `npx vitest run .../candidate/tests/kept-condition-drop.test.ts .../repeat-guard/tests/resend-admission.test.ts`,
  with `outcomes.ts` temporarily restored to HEAD (`git show HEAD:...`, then
  copied back): 4 failed, 6 passed.
  - The failures were the candidate loop replay (`expected undefined to match
    object { ok: true, revision: 3 }`) and 3 admission cases.
  - The uninvited and never-from-input cases passed, as expected, because
    they assert behaviour that was already there.
- The same restore with `.../subflow-candidate/tests/kept-condition-drop.test.ts`:
  the subflow loop replay failed (`expected undefined to match object { ok: true, revision: 3 }`).
  After restoring the fix, both tests passed.
- `npx vitest run $R/llm/repeat-guard $R/llm/evidence-loop $R/llm/tests/evidence-loop $R/flow-bootstrap/candidate $R/flow-bootstrap/subflow-candidate $R/service/candidate-trial $R/service/subflow-trial`:
  `Test Files 101 passed (101)`, `Tests 898 passed (898)`, 149 s.
- `npx tsc --noEmit -p tsconfig.json`: no output, `tsc exit 0`.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (380 warning(s), 1156 baselined)`.
  - An earlier run showed 381 warnings, because `submission.ts` had grown to
    402 lines.
  - I shortened the added comment to bring it to 399, and the count went
    back to 380.
  - That last edit touched a comment only, and I did not rerun vitest after it.

## Not verified

- No live run (per the brief).
- I did not trace the person-facing ending text ("sent again unchanged 3
  times"). With the fix, that case no longer arises from this refusal.
- I did not check other consumers of a refusal's `feedback`, such as project
  agents or the chat cards, for whether an extra `resend` field shows up
  anywhere a person sees it. It is a closed code-like value, not prose.

## Open questions or contradictions found

- The admission is one per guard key: tool, page, standing revision for a
  submission, and the Flow. The controller's own bound is one refusal per
  condition and trial (`keptRefused`). The two agree for the run's shape.
  - If the page changes between the refusal and the resend, the resend is a
    new key and runs anyway, as before.
  - If the controller ever marked a second refusal under the same key, the
    guard would refuse the third send. That is the intended bound.
- Cause 2 of the debug (the name-field condition wrongly vindicated, in
  `result-verification/`) is t651's and was not touched.
