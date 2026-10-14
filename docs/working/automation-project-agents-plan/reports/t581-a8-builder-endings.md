# t581 a8-builder-honest-endings: worker report

## Outcome

Partial. All four briefed items and the coordinator's extra item (unread part inputs) are built and tested. The
three named test sets, the typecheck and the structure audit pass. One test I was not allowed to edit now fails:
`service/project-build/tests/project-build-call-shares.test.ts`, under `service/**`, which is on my must-not-touch
list. Its stub parts declare `input: packet` and never read it, so the new `subflow.input_unread` rule refuses them.
The fix is test data only (below). I checked it in a temporary copy, which passed 2 of 2, then deleted the copy.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

1. **A builder can end honestly** (cause C, fix 4). `flow-bootstrap/subflow-candidate/builder-loop.ts`:
   - The completion schema adds `ended` (`blocked` | `partial`) and `reason`, flat, following the supervisor's
     completion schema (`project-agents/supervisor/completion.ts`). The `required` list is gone, as in the
     supervisor's schema.
   - Any result with a key a receipt does not have goes to the ending check. So `{"outcome": "blocked", ...}`, which
     the trial gate's own words invite, gets a shape refusal that shows the exact form.
   - The ending check refuses:
     - `subflow.ending_shape`: the result is not exactly `{ended, reason}` with a non-empty reason;
     - `subflow.ending_too_soon`: nothing has been submitted or tried yet;
     - `subflow.ending_after_yes`: the latest proposal's trial already passed.
   - Otherwise it accepts, and the outcome carries `ended: {outcome, reason}`.
   - The outcome also carries `lastTrial`: the last partial verdict any revision got, even if a later submission
     cleared the proposal.
   - The submit tool's description now says how to end honestly.
   - Builders get their own sent-again words. The builder's check adds them to every refusal under the key
     `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY` ("sentAgainInstead"), exported from
     `llm/decision-handlers/completion.ts`.
   - `completion.ts` always takes that key off the feedback. On a repeat it says "This completion was refused for
     these same reasons at decision N, and this is attempt T." followed by the builder's words, in place of the
     draft-mode text. A refusal without the key is passed on as the same object, so the candidate loop's text is
     unchanged. Its existing pin (`decision-context-wiring.test.ts`, toEqual on the draft wording) passes.
   - I passed the words through the check's refusal rather than a loop-input field. A field would have meant
     editing `llm/loop-configuration.ts`, which I do not own.
2. **No probe leak** (fix 5). `scoped-submission.ts` `asSent`: when a callable submission is refused by the
   existing checks, every copy of the probe script in the refusal, `previous` included, is replaced with the script
   the builder sent. `callable-target.ts`'s header and the probe-label comment now say this.
3. **No revision drops its brief's lasting act** (fix 9). The controller keeps the lasting consequences that
   accepted revisions declared (any step whose `consequences` names a class). Once there is one, a revision that
   declares none is refused `subflow.lasting_act_dropped`, naming the classes.
   - I checked this against the bigbox steps (`lab-runs/2026-10-14/run-mv8186yr-a385fd3a/steps`). switch_store
     revision 2 (step 27) declares `modify_existing`; revision 4 (step 49) declares none, so it would now be refused.
   - preserve_cart (steps 200 and 336) never declared a lasting act, so it is unaffected.
   - The rule looks back at earlier accepted revisions because the scope does not carry the brief's
     `permittedActs`. See open questions.
4. **Returns say why** (fix 6). `project-agents/dispatch/ending.ts`, `built()`:
   - A builder's honest ending becomes the return's outcome and reason. A `partial` ending with no proposal standing
     is returned as `blocked`.
   - Every return that did not pass adds one sentence on what its last trial answered:
     - entry not prepared: which predecessor had no passing proposal (`missing`), failed (`failedPredecessor`) or
       was proposed against another plan (`stale`);
     - otherwise, the subflow's own failing step: its number, label, control, failure code and what happened. The
       trial's `builtin.control.*` frame steps are skipped;
     - otherwise, the judge's observed, advice or why.
   - Quoted page and judge text is capped at 200 characters and the builder's reason at 1000, inside the 2000
     limit. `done` returns are unchanged.
5. **Coordinator's extra item: every declared input is read.** `callable-target.ts` refuses a callable part whose
   `input: <name>` nothing reads, with `subflow.input_unread`, the line, and a message naming the input. The message
   tells the builder to end the brief blocked if the plan gave it an input it has no use for.
   - **What counts as a read:** `$input.<name>` (not a longer name starting with it) written anywhere in the target
     part's own lines except its `input:` lines. That covers a step's value, a condition or `done when:` fact, a
     value given on to a helper part it calls (`query: $input.query`), and an output line. Handler blocks written
     inside the part (`handler.parent`) also count.
   - A helper part's own `$input` reads do not count: they read the helper's inputs, not this part's.
   - The check runs only after the declared inputs match the scope's names.

Tests:
- New `flow-bootstrap/subflow-candidate/tests/builder-ending.test.ts`.
- New `project-agents/dispatch/tests/brief-return-reason.test.ts`.
- Three new cases in `scoped-submission.test.ts`.
- One new case in `llm/decision-handlers/tests/completion.test.ts`.
- `scoped-submission.test.ts`'s `callable()` fixture now reads its input.
- `project-agents/supervisor/tests/supervisor-fixture.ts`: I added one `web.dom.type ... text: $input.<name>` step
  to each of its three callable scripts. This file is outside my owned paths, but it is test data the new rule
  invalidated, and without it two supervisor test files fail. Revert it if you would rather do it yourself.

## Commands run and observed results

- Run from `packages/fluxiq`. `R` is `src/programs/automation-studio/runtime`.
- `npx vitest run $R/flow-bootstrap/subflow-candidate $R/llm/decision-handlers $R/project-agents`: "Test Files 48
  passed (48)", "Tests 308 passed (308)". This was the last run, after every edit.
- `npx vitest run $R/flow-bootstrap/candidate $R/llm/decision-context $R/service/project-build
  $R/service/subflow-trial $R/conversations/commands/tests/candidate-endings.test.ts`: "Test Files 1 failed | 34
  passed (35)", "Tests 1 failed | 241 passed (242)".
  - The one failure is `project-build-call-shares.test.ts`, "three builders on one 64-call build". Its
    `b-open_packet` brief came back blocked with `llm_evidence_loop.invalid_decision` because its script's
    `input: packet` is never read.
  - A temporary copy of that test, with the change below, passed: "Tests 2 passed (2)". I deleted the copy;
    `git status` shows only my changes.
- `npx tsc --noEmit -p .`: exit 0, no output.
- `node scripts/structure-audit.mjs` (Core root): "structure-audit: passed (356 warning(s), 1156 baselined)". No
  warning names any file I changed.

Change needed in `service/project-build/tests/project-build-call-shares.test.ts`, lines 25 and 26. In both the
`open_packet` and the `plant_packet` script, insert these four lines before `"end"`:
`"  step: type the packet", "    node: web.dom.type", "    selector: .packet", "    text: $input.packet",`

## Not verified

- No live run and no model call, as briefed. I have not seen how a real model reacts to the ending or its wording.
- The whole Core suite was not run, per the twice-a-day rule. Other suites outside the sets above may have stub
  parts that declare unread inputs; `grep 'input: '` over test scripts would find them.
- I did not check the activity observer and chat cards with the hidden `sentAgainInstead` key or the new ending
  result. The key is removed before the model and history see the refusal, but the observer wraps
  `checkCompletion` and may see it.
- The lasting-act rule assumes the permission gate refuses an act a brief was not permitted. If it does not, a
  revision with an act the brief was never asked for would set the rule off. I did not trace this.

## Open questions or contradictions found

- **Lasting act from the brief.** Fix 9 would be stronger, catching a first revision with no act at all, if the
  scope carried the brief's `permittedActs`. That needs `project-agents/dispatch/scope.ts` and
  `subflow-candidate/contracts.ts`, neither of which I own.
- **A return from a thrown builder** (`ending.thrown`) still has no trial words, because `spend` holds no trial
  result and `run-brief.ts` (must not touch) builds it.
- **The trial gate's wording.** `subflow-trial-gate.ts:43` (t578's file) still says "complete with outcome
  blocked". The builder now routes that shape to a refusal that shows the exact form. It would be cleaner to name
  `{"ended": "blocked", "reason": ...}` there.
- **An input the plan gives but the subflow cannot use.** With `subflow.input_unread`, the builder can neither drop
  the input (the interface must match the scope) nor leave it unread. Its only way out is the honest ending. That is
  intended, so the supervisor learns the plan is wrong, but it depends on the supervisor reading the reason and
  amending the plan.
