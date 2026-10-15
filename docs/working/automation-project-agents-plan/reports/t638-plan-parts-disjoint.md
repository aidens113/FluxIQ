# t638 plan-parts-disjoint: worker report

Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t638/!FluxIQ`, branch `task/t638-plan-parts-disjoint`. Nothing committed.
Source: RC1 and "Contributing causes" of the extension repo's `reports/a8-crossborder-run-mv9q50ui-debug.md`.

## Outcome

Done. All five fixes are in, each with its test. tsc is clean, the vitest runs on `project-agents` and
`service/project-build` pass, and the structure audit passes. Fix 4 has one limit, given under "Open questions": the
supervisor is told to end again from what the build holds plus a conditional sentence, not from a recorded fact that
an ending was held.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (1) Overlapping quotes refused: `project-agents/contracts/task-spec.ts`

- `quoteIssues` now places each verbatim quote in its source and refuses `project.quote_overlaps` at
  `taskSpec.parts.<i>.quote.text` when its span shares a character with an earlier part's span in the same source.
- A quote that appears more than once takes the first place no earlier part holds, so words a person repeats are not
  read as an overlap. Touching spans (one ends where the next begins) are accepted.
- `record/store.ts` (`recordTaskSpec`) and `supervisor/plan-input.ts` both call `quoteIssues`, so the check covers
  write, amend and the record. Neither file changed.

### (2) A part carried twice refused: `project-agents/contracts/structure-plan.ts`

- `issues` now refuses `project.plan_part_carried_twice` at `structurePlan.partOf.<key>.<i>` for every carrier of a
  part after the first.
- Router situation alternatives count as one carrier: when the router has rules, that is its rule targets plus its
  fallback target. A `recovery` subflow counts as none.
- `plan-input.ts` already maps `structurePlan.partOf.<key>.<i>` to `subflows.<at>.parts.<i>`, so the supervisor sees
  the refusal at the path of what it sent.

### Words for (1) and (2): `project-agents/supervisor/guidance.ts`

New `planIssues` entries:
- `"project.quote_overlaps"`.
- `"project.plan_part_carried_twice"`.

Changed supervisor-facing sentences (these are the only prompt changes):
- `howToWork` step 1: added the sentence "Parts share no words: where one stretch of the person's words holds another,
  it is one part, or split it into stretches that do not overlap."
- `howToWork` step 2: "parts are the ids of the parts it carries;" became "parts are the ids of the parts it carries,
  and each part is carried by one subflow only;".
- `tools.writePlan`:
  - "every part is carried by at least one subflow." became "every part is carried by exactly one subflow."
  - "checks that every part's text is in its instruction exactly as written and that every part is carried;" became
    "checks that every part's text is in its instruction exactly as written, that no two parts' texts overlap, and that
    every part is carried by exactly one subflow;".
- `next.afterReset`: rewritten (see fix 4).
- New strings: `next.afterResetNothingAssembled`, `next.afterResetNothingToTest` and `refusals.briefRepeatedOthersSent`.
  Each names its own field (`repeated`, `returns`) or code.

`EXAMPLE` is unchanged; its parts were already disjoint. The guard test (`supervisor/tests/guidance.test.ts`) still
passes on every string.

**Pins:** no supervisor prompt pin exists. I checked `llm/deepseek/tests/system-prompt-pins.json`: it holds no
supervisor key and no "supervis" string. I also grepped the guidance strings across `src`. No pin moved.

### (3) Only the repeated brief is held back: `project-agents/supervisor/dispatch-tool.ts`

- `repeatedBrief` became `repeatedBriefs`, which returns the list of repeats.
- When every brief in a call repeats a blocked one, the call is refused whole, exactly as before.
- When only some repeat, the others are sent. They are renumbered from a fresh `state.briefIds()`, so ids have no gap.
  The answer is `ok: true` and carries
  `notSent: { code: "project.brief_repeated", instruction: briefRepeatedOthersSent, repeated }`, beside the sent
  briefs' returns.
- The call is still refused whole when a brief left runs after a held-back subflow (`entry.predecessors`). It is also
  refused whole when the dispatch order of the remainder fails, in which case it returns the `brief_repeated` refusal.
- The header comment records both t638 rules.

### (4) What follows a reset: `dispatch-tool.ts` and `guidance.ts`

A call made only of resets now gets one of three `next` texts from `afterReset(context)`:

| Situation | `next` text | What it says |
| --- | --- | --- |
| No assembled Flow | `afterResetNothingAssembled` | End again (or send briefs and assemble). Never test. |
| Latest assembled Flow is not `gate.retestable()` | `afterResetNothingToTest` | Complete on its yes, or end again, or change and reassemble. Never test. |
| Latest assembled Flow may be tested | `afterReset` | Leads with "If you sent it because your ending was held for a reset (project.completion_reset_first), end again now: nothing holds it back. Otherwise test the latest assembled Flow with core.test_candidate." |

"Not `gate.retestable()`" covers judged no, failed twice, passed, or retests used.

### (5) The entry note names what predecessors left: `service/project-build/brief-ports.ts`

- On a prepared entry, the builder reads the project ledger's in-place, declared (not `possible`) acts whose `ref` is
  the preparation run's (`<runId>#step-N`). It passes them as `{ act, did }`, the same named form a trial's
  `leftOnSite` takes.
- The prepared note then carries `predecessorsLeftOnSite`, plus two sentences:
  - "Their lasting acts are under predecessorsLeftOnSite: each is on the site now, even where a page has not caught up
    with it."
  - "If one of them is what a part of yours asks for, a subflow before yours already does it: do not do it again, and
    end the brief blocked naming that act, so the plan can change."
- With nothing landed, the note is byte-identical to before.
- The header comment adds a t638 paragraph.
- I did not touch `phase-start.ts`. I read the acts from the ledger rather than from the `own.trialRan` return there.

### Tests

- `contracts/tests/task-spec.test.ts`: refused cases are the whole request containing p2, a span inside p1, and
  identical quotes. Accepted cases are adjacent spans, repeated words placed apart, and the same words in two
  instructions.
- `contracts/tests/structure-plan.test.ts`: refused cases are a part carried twice, and an alternative plus a later
  subflow. Accepted cases are router alternatives and a recovery subflow.
- `supervisor/tests/repair-repeats.test.ts`, two new tests:
  - A repeat beside a changed brief: the changed brief is sent as `brief-3`, the record holds brief-1..3, and `notSent`
    names `briefs.0`.
  - A repeat with a dependent: the call is refused whole.
- `supervisor/tests/reset-next.test.ts`, new file:
  - With nothing assembled after `completion_reset_first`, `next` is `afterResetNothingAssembled`.
  - With the latest Flow testable, `next` is `afterReset`; after its no, it is `afterResetNothingToTest`.
  - The `afterReset` wording puts ending again before the test.
- `service/project-build/tests/project-build-brief-ports.test.ts`: no new service run was added.
  - The dependent-entry test now also asserts that `predecessorsLeftOnSite` is absent when the predecessor makes no
    lasting act.
  - The start-hook test now asserts `predecessorsLeftOnSite: [{ act: "act-3", did: /^trial step \d+ / }]` and the
    note's words.
- `project-agents/record/tests/store.test.ts`, outside the listed tests: its "replanned" plan gave p2 to two subflows
  only to get a new digest, so the new rule refused it. I changed it to rename a subflow instead, which keeps what the
  test is about (a brief bound to the latest plan).

## Commands run and observed results

All commands were run from `packages/fluxiq` unless noted, with nothing heavy running beside them.

- `npx tsc --noEmit -p tsconfig.json`: exit 0, after the final edits. The first run failed with TS2451 on `repeated`,
  which clashed with the reset variable; I renamed it to `repeats`.
- `npx vitest run src/programs/automation-studio/runtime/project-agents`:
  - First run: 3 failed. These were `store.test.ts` (the replanned plan above) and my two new supervisor tests, whose
    fixture scripts did not fit.
  - Final run: `Test Files 42 passed (42)`, `Tests 329 passed (329)`.
- `npx vitest run src/programs/automation-studio/runtime/service/project-build`: `Test Files 15 passed (15)`,
  `Tests 70 passed (70)`, Duration 70.30s.
- `npx vitest run .../activity/project/tests/cards.test.ts .../service/tests/provider-unavailable-authoring-modes.test.ts`
  (other tests that write plans): `2 passed`, `18 passed`.
- `node scripts/structure-audit.mjs` (repo root): `structure-audit: passed (376 warning(s), 1156 baselined).`
  - New advisory warning: `dispatch-tool.ts: 431 lines` (it was 400).
  - `brief-ports.ts` is at 482 lines and was already past the threshold at 463.
- `npx biome check <changed files>`: biome ignores these paths, so it gave no result.

## Not verified

- No live run, as the brief says.
- `flow-bootstrap/subflow-candidate/tests/role-tools.test.ts` also mentions `taskSpec`. I did not run it, because
  `flow-bootstrap/**` belongs to t639, which is editing there.
- Full suites were not run.
- Whether a real supervisor model follows the new words was not checked.

## Open questions or contradictions found

- **Fix 4 precision.** Only `completion.ts` knows that an ending was held (`project.completion_reset_first`), and
  `state.ts` keeps no record of it. Both files are outside this brief.
  - So the dispatch answer cannot tell a reset sent for a held ending from a reset sent before a whole test. With a
    testable Flow it says both in one sentence, ending again first.
  - A precise answer would need one flag: set in `completion.ts` when it refuses `reset_first`, read by `afterReset`,
    and cleared on the next non-reset tool call. That would let the answer say only "end again" in that case. I
    recommend it as a small follow-up if the conditional wording proves ambiguous live.
- **Exemption scope in fix 2.** Supervisor-written plans never have router rules or `recovery` roles: `plan-input.ts`
  compiles a rule-less router. So the exemptions only matter for structure plans written another way, such as
  `recordPlan` from other callers.
