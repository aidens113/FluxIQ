# w1-lab-person

## Outcome
Partial. Items 1 and 2 are done and verified. Item 3's script is written and attempt 1 passes with the Lab person's hand-off recorded. The browser proof does not exit 0, because attempt 2 never runs a saved Flow. Attempt 1's draft is refused at assembly (`flow_bootstrap.evidence_completion_parameters_unresolved`, with `web.handle.ambiguous` on plan nodes), so there is no saved Flow to run. I did not isolate the cause (see Open questions).

## What changed and why
All paths under `packages/test-runner/src/attempt-lane/`.
- `live/attempt-person.ts` (new): `attemptPersonFor` starts the declared Lab person (`startLabPerson`) once per attempt.
  - Inputs are the same as the legacy lane's: the task's own `personCheck`, the scenario's `PERSON_CHECKS`, and `permissionPoint`.
  - The answer is pressed in the chat via `browser.panel.press`. The answerer is a small copy of `run-scenario/chat-build/chat-entry.ts`, which I could not import.
  - Each attempt's snapshot is kept by ordinal. `playable` is true when the scenario ships a `person-check` module.
  - It is per attempt because the Lab restarts Core between attempts (commit 2b9297056).
- `live/live-driver.ts`:
  - New optional `person` input. The person is started before the message or Run-again press and finished in a `finally` after the attempt is followed.
  - Passes `personPlaying` to `followAttempt` when `person.playable`.
- `live/follow-attempt.ts`: `waiting_for_person` is a stop only when no person is playing (`stopsOn`). With a person playing it is followed on, and only the existing stall rule can end the watch.
- `live/run-attempt-command.ts`: builds the person from the request's task, the scenario's lab dist and the panel.
  - It writes `person-hand-offs.json` into each attempt's evidence folder.
  - It puts `personHandOffs` on each attempt entry in `attempt.json`.
  - Each hand-off is logged as `[attempt] the Lab played the person at a check: ...`.
- `live/index.ts`: exports.
- `live/tests/follow-attempt.test.ts`: the waiting status was removed from the always-stops list, and three tests were added (stops on a wait with no person, follows on with a person, and a silent person still ends by the stall).
- `scripted-model/scripts/crossborder-marketplace-free-hubs-under-ten.ts` (new), registered in `scripts/index.ts`, with `scripts/tests/crossborder-marketplace-free-hubs-under-ten.test.ts`.
  - The script clears the covers, searches `usb c hub`, presses Free shipping, types Max 10, presses OK, then presses Price ↑.
  - It detects the structure from a card's title link, then reads title, store, price and rating with `where: ad mark not present`.
  - Every handle and field key is read from evidence.
  - It never touches the traffic screen: Core hands that to the person. It has two `panel_command` turns for the two attempts.
  - It is call-history driven (each step once). A page-state-driven version pressed OK and Price twice, because the page a decision reads after a hand-off is still the pre-press one.
- `person-simulation/` was not touched.

## Commands run and observed results
- `pnpm check` in `packages/test-runner` printed no errors and the build cache reported `test-runner:check` built (exit 0). It was run twice, the second time after the last edits.
- `node --test "dist/attempt-lane/live/tests/*.test.js" "dist/attempt-lane/scripted-model/scripts/tests/*.test.js"` → `# tests 73 # pass 73 # fail 0`. This ran after the final build. A wider run that included `scripted-model/tests` showed 2 failures before I fixed my script test's page fixture. I did not rerun that wider set.
- `node scripts/structure-audit.mjs` → `structure-audit: passed (244 warning(s), 552 baselined).` This ran before the script test and the later script edits were written. I did not rerun it after.
- Provider-free proof, `FLUXIQ_LAB_INSTANCE=t877-w1 ... pnpm lab attempt crossborder-marketplace --task crossborder-marketplace-free-hubs-under-ten --authoring-mode answer-first --scripted-model --attempts 2`, run six times while iterating:
  - Runs 1 and 2 were stopped early by script bugs: a Max regex broken by a stray backspace character, a wrong card target, and a missing second `panel_command`.
  - The best run was run-mw459uzz-85b7be47, with the state-driven script. Both answers were right (attempt 1: 10 rows, achieved; attempt 2: 10 rows, achieved). The Lab person cleared the traffic screen twice in attempt 1, answered in the chat, and followed the attempt through the `waiting_for_person` waits. The run exited 1 because `secondStartedFromFirst` is false: `first_saved_nothing, second_found_something_else, second_explored_from_blank`.
  - The last run, run-mw45o8hd-dd574c2d, used the final call-history script. Attempt 1 achieved, with the person hand-off recorded in `attempt-1/person-hand-offs.json` (check `traffic-screen`, `cleared`, answered `person_done`, `via: chat`). Attempt 1's draft was refused at assembly again.
  - In that last run, attempt 2 met the traffic screen on its first search and the Lab person cleared it (log: `waiting_for_person for person_only_check, 2 live steps, 1 calls`, then the hand-off line). The script then refused request 15: after that clear, the page had no `Price ↑` for the sort step. That run exited 1 as `not_judged`, so `attempt-2/` was not written.
  - No run produced exit 0 with a recorded hand-off on both attempts. `follow-attempt` and the person start do work end to end in the browser.

## Not verified
- Exit 0 of the acceptance proof.
- Hand-off recording on attempt 2 in a judged run. It was observed in the log only; `attempt-2/person-hand-offs.json` was not written.
- A Flow replay on attempt 2.
- The structure audit after the last edits.
- The whole test-runner test suite, and the other scenarios' attempt runs.

## Open questions or contradictions found
1. **The Flow does not assemble. This is the blocker.**
   - Attempt 1 ends achieved, but the draft is refused with `flow_bootstrap.evidence_completion_parameters_unresolved`. A follow-up note says `web.handle.ambiguous at plan.subflows.0.nodes.9/10.parameters`.
   - Ruled out:
     - Duplicate presses. They were removed in the final script and the refusal remained.
     - The person hand-off itself.
     - A wrong detect target. The detect target is now a card title link.
   - Not resolved: which node is ambiguous. The note carries codes only, with no node names.
   - Strongest suspect: the result cards hold two currency columns (the sale price `2,89 €` and the struck-through list price `7,23 €`), and the output column must be named `price`. Core's by-meaning column match may find the name ambiguous.
   - Second suspect: a target (a `Price ↑` tab or `OK`) matches more than one element when the plan is assembled.
   - Suggested next step: have a Core-side worker run the flow-bootstrap assembly on the recorded draft. It is in the model request files under `test-runs/instances/t877-w1/attempts/run-mw45o8hd-dd574c2d/model/`, as `core.flow_draft` in the later `evidence_tool_decision-*` requests.
   - Alternatively, change how the script names or selects columns, if the supervisor wants a script-side workaround.
2. Attempt 2's first search meets the screen, as expected. In attempt 2 the page a decision reads after a person-cleared call can still be the pre-press one. The script is therefore call-history driven, but that also means a lost press (a filter dropped by the reload) is not retried by the script.
3. Fresh evidence from the runs sits under `test-runs/instances/t877-w1/attempts/` (instance `t877-w1`): run-mw459uzz-85b7be47 (both right, no saved Flow) and run-mw45o8hd-dd574c2d (last).

```text
Outcome: Partial
Changed: packages/test-runner/src/attempt-lane/live/{attempt-person.ts,follow-attempt.ts,live-driver.ts,index.ts,run-attempt-command.ts,tests/follow-attempt.test.ts}; packages/test-runner/src/attempt-lane/scripted-model/scripts/{index.ts,crossborder-marketplace-free-hubs-under-ten.ts,tests/crossborder-marketplace-free-hubs-under-ten.test.ts}
Validation: `pnpm check` (test-runner) -> exit 0; `node --test` on live/tests and scripts/tests -> 73 pass, 0 fail; `node scripts/structure-audit.mjs` -> passed (244 warnings, 552 baselined; run before the last edits); lab attempt proof -> exit 1 (attempt 1 right with hand-off recorded; attempt 2 not judged, as no saved Flow assembled)
Not verified: exit 0 of the acceptance proof; hand-off recorded in a judged attempt 2; Flow replay on attempt 2; structure audit after the last edits
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w1-lab-person.md
Notes: Cause of the draft's `web.handle.ambiguous` refusal is unresolved (two currency columns on the cards is my suspect); needs a Core-side look.
Notes: Lab person works for both attempts and answers in the chat; follow-attempt follows waits only while a person is playing.
```
