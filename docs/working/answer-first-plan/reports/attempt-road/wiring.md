# Wiring t870's functions onto the road (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. No provider call, no Lab, no browser, no git mutation. `service.ts` is still 4304 lines.

## Outcome

Done, with the caveats under "Not verified". All eight items are in.

## What changed and why

1. **Known Flow.** `get-task-known-flow` `{ projectId, instructionText, startLocation? }` is a `read` route (`handlers/task/known-flow.ts`). A command reaches Core only through its port, so it needed one. It answers `{ flowId }` for the exact same task, `{}` if none, and `{}` (not a failure) if the memory cannot be read or the Flow is gone. `create-here.ts` asks first (`commands/answer-first/known-flow.ts`, answer-first mode only) and skips `create-flow` when it gets a Flow. It is not on the token list, since only Core's own chat asks. A call that throws is read as a failed call, so a task never fails for it.
2. **Reads.** `outcome-of-attempt.ts` and `outcomes-of-conversation.ts` take an `AutomationStudioAnswerFirstOutcomeSource` (`locator` plus `list`) in place of the store, and the handlers build it from `automationStudioAnswerFirstAttemptsRead`. The store does not import `interrupted/`, so no cycle. A row whose Core died reads `waiting_for_person` / `interrupted`. The two older tests that read an unclaimed `working` row now claim the attempt live, as a real attempt does.
3. **Carry-on.** Route `carry-on-task-attempt` `{ projectId, attemptId, addUsd }`: `authoring`, `flows.write`, `studio:CarryOnTaskAttempt`, Write, domain access asserted, on the token list and narrowed to those three fields (`apps/web/src/lib/program-route.ts`). It runs `automationStudioAnswerFirstCarryOn` with the generate call as `run` (no new request field), answers `{ attemptId, budgetUsd }` at once, never awaits `finished`, and catches it. A refusal is Core's `say`. IAM catalogs regenerated: 2 lines in `actions.generated.ts`, 1 in `read-only-actions.generated.ts`. Extension: `fluxiq.panel.carryOnTaskAttempt` (`constants.ts`, `AUTOMATION_PANEL_MESSAGES.carryOnTaskAttempt`), a relay case sending exactly three fields and refusing an amount that is not zero or more, and `addBudgetAndCarryOn` on the port (`carry-on-attempt.ts`).
   **Keep going.** The press is handled in `answer/view/handlers.ts`, not in `chat-widget.ts`: the answer model gained `keepGoingCarriesOn` (true only for `interrupted`), and for it the press calls `addBudgetAndCarryOn` with `addUsd: 0`, with the result said under the card ("Carrying on." or "I could not carry it on. <Core's sentence>"). `stuck_in_a_loop`, and a client with no carry-on, still go to `onKeepGoing`, which is still `send("Keep going.")`. I chose this over editing the widget callback because the callback is not given the attempt's status, and the card has a status line for a refusal. `ChatAddBudgetQuery`'s doc now says zero for an interrupted attempt. The fake port (`testing/results/port.ts`) now accepts `addUsd: 0` for an interrupted attempt, as Core does.
4. **Provenance.** `ChatTaskOutcome.provenance` was already there (t871). Core: `AutomationStudioTaskOutcome.provenance`, filled in both read routes from `taskMemory.provenance` in plain words (`handlers/task/attempt-provenance.ts`), absent for an attempt with no memory, and a memory that cannot be read costs the marks, not the read. Extension: `read-provenance.ts` checks the exact shape and `read-task-outcome.ts` lets the field through. A malformed or extra-keyed provenance fails the read.
5. **Closed popup.** Nothing needed fixing. `readThread` asks Core on every read, the chat reads on activation, and again when `controller.state().conversationId` becomes known (`chat-widget.ts` lines ~286-290 and ~509-513), so a reopened panel reads as soon as its thread is known. I pinned it with a test that a result arriving between two ports is told by the second one's first read.
6. **The card's line.** `site-words.ts`: "On the site: I recorded no changes". A read task with no act gets it too and reads fine there (true, if slightly formal). Updated the two tests and the `answer-view.ts` header.
7. **Forward run is not a test.** Core marks a step run under the build's unit `testing` (`activity-action/action-of.ts`, phase `verifying`), which is true of a candidate build's test and of nothing in an attempt. Fix is in the chat's step stream, not Core's activity wording: `stream/step/messages.ts` marks a unit as an attempt when its opening row says "Working on your task" (`opensActivityAttempt`) and `not-a-test.ts` takes the mark off that unit's cards. Candidate-mode cards are byte for byte as before (test beside it).
8. **Docs.** Extension `testing-facility.md`: one paragraph naming `FLUXIQ_ATTEMPT_SCRIPT_FORM` and `site.json`. Extension `extension-client.md`: the new message row, provenance, the closed-popup note and carry-on. Core `llm-flow-bootstrap.md` (interrupted view, provenance, known Flow, carry-on) and `client-gateway.md` (allowlist entry).

Also: `handlers/task/` (five `task-` files plus a barrel) because the structure audit refused 5 files sharing a prefix and 27 files in `handlers/`.

## Commands run and observed results

Core, `packages/fluxiq`, vitest by path, `--minWorkers 1 --maxWorkers 2`:

```text
commands/tests, attempt-store/tests, api-contracts/automation, domain-scope.test.ts   17 files, 164 tests passed
task-attempt-wiring (9), task-attempt-routes, answer-first-chat-road, answer-first-known-flow, domain-scope   5 files, 33 passed (after the move to handlers/task/)
src/platform/iam/catalog, endpoint-classification   4 files, 18 passed
```

`packages/ui-components`: `src/chat/answer src/chat/stream src/chat/tests/answer-in-chat.test.ts results-reach-chat.test.ts src/chat/ports src/testing/results` 30 files, 228 passed (first run had one failure in `messages.test.ts:247` ask kind, from a stale `fluxiq` dist; gone after the rebuild).

`apps/web`: `route.test.ts` and `program-route.test.ts` 77 passed (after I made the generic allowlist test send a carry-on body, and added a refusal test); `tsc --noEmit` exit 0.

`pnpm.cmd --filter fluxiq --filter @fluxiq/ui-components check` exit 0, no `error TS`. Core build (`contracts`, `fluxiq`, `ui-components`, and `client-gateway-websocket`) exit 0. Structure audits: Core `passed (501 warning(s), 1097 baselined)`, extension `passed (240 warning(s), 552 baselined)`. `core-mirror`: `1 mirror set(s) match`. `wc -l service.ts` 4304.

Extension: `pnpm.cmd --filter @fluxiq-web-extension/extension check` exit 0 (`core-build ... is current`); `node scripts/test-extension.mjs panel/chat/transport background/automation-relay/tests` 50 tests, 50 pass (was 43; 7 new, and one old assertion that the port had no carry-on was flipped).

Teeth: the Keep going widget test failed in the first run for the interrupted case until the fake port accepted a zero amount; the loop case asserts the `"Keep going."` message was sent and no carry-on made. The stepping test shows the candidate card keeps "Testing: Click".

## Not verified

- **No browser.** Keep going on an interrupted attempt is proven by a narrow test over a fake port and fake document, and the relay and port by scripted calls. The real token, background and Core have not met this route.
- **A carried-on attempt that really continues.** The route test stubs `service.generateFlowBootstrapAdaptation`. `automationStudioAnswerFirstCarryOn` itself is t870's, with its own tests.
- **The interrupted read test's teeth** (taking `AttemptsRead` out of the source to see it fail) I did not run; it is a 75-second run and the reasoning is plain.
- **Whole-package suites**, per the rule.

## Open questions and findings

1. **Carry-on sends no `startLocation`.** The generate request has none to send, and the carried attempt takes its task and steps from the held row, not the key. If a round after a restart wants the start page, it needs a field, which I did not add.
2. **A paired actor's key.** The route calls generation with the paired actor's own session (`client-gateway:...`); the key provider falls back to the person's live unlock, as every call does, but the chat's command path maps to the unlocked session first (`caller.ts`). With no unlock it ends as `secrets.locked` does. Not exercised.
3. **Item 7's edit is in `ui-components/src/chat/stream/step/`**, outside the paths listed. The brief named "the card words", and the unit is only known there. A root fix would put the mode in `runtime/automation-activity/wording/tool-call.ts`, which is not mine.
4. **`packages/test-runner/.../shown-answer.test.ts` holds the old line as a fixture string.** It is a test input, not an assertion on the product, so it still passes; the file is not mine.
5. **The Firefox popup** uses the same port; not run.
6. **No version bump** of `fluxiq`, `@fluxiq/contracts` or `@fluxiq/ui-components` (the lead merges and bumps).
