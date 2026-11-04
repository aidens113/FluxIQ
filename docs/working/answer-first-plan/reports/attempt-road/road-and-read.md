# The chat's road and the attempt read (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`. No provider call, no Lab, no browser.

## Outcome

**Done, with one seam for t871.** A task typed in the chat runs on `answer-first`, and each hop is proven by a test with the attempt itself stubbed. The result is readable back by attempt and by thread, from Core through the extension's relay and port. One line in t871's screens is still needed before a run's card stops saying $0.00 (see "Spend").

**Stable names for the other worker:**

| Thing | Name and shape |
| --- | --- |
| Route | `get-task-attempt` `{ projectId, attemptId }` -> `{ outcome: { attempt, result?, saved?, comparedTo? } }` |
| Route | `list-conversation-task-attempts` `{ projectId, conversationId }` -> `{ outcomes: [...] }`, oldest first |
| Panel message | `AUTOMATION_PANEL_MESSAGES.taskOutcomes`, the string `fluxiq.panel.taskOutcomes`. With `conversationId` it answers `{ outcomes }`, with `attemptId` it answers `{ outcome }`. Naming both or neither is refused |

Refusals from Core, in words: not found is "I could not find that attempt." (`errorCode: task_attempt.not_found`); unreadable is "What was kept of this task could not be read, so I cannot say how it went." (`task_attempt.unreadable`). Over the token route both arrive at the panel as the sentence, since `callCoreProgram` carries `error`, not `errorCode`.

## What each hop did before I touched it

| Hop | Before | What I found |
| --- | --- | --- |
| `create-here.ts` -> `build.ts` | Asked for `configured` | Fine |
| Command port -> registry | `generate-flow-bootstrap-adaptation` is `authoring`, so reachable | Fine. `afterSuccess` filters only a route with `list`, and this has none |
| `llm-generation.ts` -> `generate.ts` | Resolves `configured` to the mode, answers `{ answered }` or `{ setupNeeded }` whole | **Not broken.** Your worry about a layer filtering, reshaping or refusing `configured` does not hold on this road: the chat reaches it in process, so the token route's allowlist and narrowing are not on it. Now proven |
| Command's answer | `progress.succeeded(words)`: one line, and the attempt dropped | **Broken for reading back.** Nothing tied a thread to an attempt. The outcome now carries `answered` (attempt, result, candidateId) |
| `execute.ts` background wrapper | Writes `summary` and the attachment, drops the rest | Left as it is. The thread gets one line and reads the rest by route, so a card is not carried in a turn |
| `explore.ts` | Stayed a candidate build | **Fixed**: same attempt, same words, same announce and summary. It differs only where a failed call names no new Flow |
| Reading an attempt | No route at all | **Added**, below |
| Token route (`apps/web/src/lib/program-route.ts`) | An allowlist: a new route is unreachable by token | **Would have refused the extension.** Both routes added, with its tests and docs |
| IAM catalog | Generated, with a drift test | Regenerated: 2 lines in `actions.generated.ts`, 2 in `read-only-actions.generated.ts` |
| Extension port | Run-based only, `reportsSpend: false` | **Fixed**, below |
| Extension bundle gate | Refuses a Core entry not listed | `packages/contracts/src/automation.ts` added to Core's `browserBundles.entries`, as the gate's own message says to. This is the answer to how the extension reaches `@fluxiq/contracts` |

`S/api-contracts` declares the routes (`automation/task-attempt.ts`) and `conversationId` on the generation request. I did not declare `answered` or `setupNeeded`: the road does not need it, since the command reads them by shape through the contract's parsers.

## The routes as built

`S/programs/automation-studio/api/handlers/task-attempts.ts`. Both take `programs.read`, `read`, resource `project`, and assert the project's domain access first, as dataset and conversation reads do, because a result holds rows. They are in `domain-scope.test.ts`'s pinned list. The list route's access level is `List`, because the registry requires that of a `List...` action.

- **Outcome.** Each record goes through the contract's parser, and the pair through `checkAutomationStudioTaskAttemptResult`. A record that fails is a refusal.
- **`saved`.** `candidateId` gives `partly_works`, `unproven`, the Flow, `savedAtMs` = the attempt's end (or start if it has not ended). No `candidateId` gives no `saved`. Steps kept on the row are not told as saved, since no state in the contract says that truthfully.
- **`comparedTo`.** The latest earlier attempt on the Flow **at the same task that has ended**. This is narrower than your wording: a different task's time, or a row still working, would make a false "this time / last time".

## The index

`SVC/answer-first/attempt-store/locator.ts`, one file per project at `<project>/indexes/answer-attempts.json`.

- **Attempt to Flow** is written by the store's `save`, so `attempt/**` was not touched. It writes once per attempt. It runs after the row, and a failure here makes that `save` reject, which `keep.ts` and `ending.ts` already catch. Tested: the row survives and the next save mends the entry.
- **Thread to Flow.** You asked for the command to write it. The command names its thread on the generation request (`conversationId`), and `generate.ts` notes it before the attempt starts. **I chose this over a new write route**: it adds no IAM action and no third route, and it only notes when the mode really is answer-first.
- **A note that fails does not stop the task.** The answer carries `threadNotNoted`, and the thread's line adds "I could not tie this to this chat, so the result may not show here. It is kept with the Flow."
- **A thread holds a Flow until another thread takes it.** A saved Flow picked up from a second thread shows its later attempts there only. Attribution is by `startedAtMs` against the note's time, one process clock. You asked for "a conversation to its Flows", and without this an old thread would grow cards for work done elsewhere.
- **Unreadable** is a refusal, never not found or an empty list. The next write keeps a bad file aside as `.unreadable` and starts again, as the attempts file does. After that, older attempts are `not_found` by id, and stay readable by Flow.
- **An old Flow with no entry** stays readable by Flow (`store.get`) and is `not_found` by id. Tested.
- **Kept:** 5,000 entries of each kind per project.

`service.ts` gained no lines (4304). The routes need its stores, so `projectPaths`, `flowPaths` and `projects` lost `private`. **Overrule if you prefer another way.** A field or a method would have added a line or a packed statement, and the code-structure rules refuse packing.

## The Extension

`apps/extension/src/panel/chat/transport/ports/results/`:

- `read-task-outcome.ts` runs a record through the contract's parsers and the cross-check. Unknown keys fail, as the contract's own parsers do.
- `read-core-outcomes.ts` is the two reads. A record from another project is a failed read too.
- `merged-outcomes.ts` joins Core's attempts with held runs, oldest first. A run an attempt already tells is dropped by `runId`, because an attempt's own session can arrive in the feed as a finished run.
- `readAttempt` answers a held run without a call, and asks Core for anything else.
- Relay: `background/automation-relay/automation-relay.ts`, sending exactly the named fields, with a test that a stray field does not reach Core.
- **No gateway message, domain mapping or capability changes:** this is a program call over the pairing token, like `exportDataset`. Docs: `docs/architecture/extension-client.md`.
- A failed Core read fails `readThread`, even if the panel holds runs. The reader keeps what it last showed, so a blip does not take a card away. Returning runs alone would have.

## Spend: the choice, and the seam

**No choice inside my paths can satisfy both rules.** `reportsSpend` is copied once when the transport is leased (`packages/ui-components/src/chat/lease-transport.ts:58`), so even a getter cannot vary it, and a thread can hold both kinds. No per-run spend I can trust exists either: `tokenUsage` on a run summary is a sum over the run's interventions, I did not confirm it covers every paid call, and it is absent on a run with none, so a $0.00 from it could still be made up.

**What I did:**

1. The port no longer says `reportsSpend: false`, so an attempt's real spend shows on the card and the meter.
2. Every run-derived outcome now says `spendUnknown: true`, a new optional field on `ChatTaskOutcome` in `ports/results.ts`.

**The seam for t871, one line:** `packages/ui-components/src/chat/answer/model/answer-model.ts`, at the top of `answerModel` (line 62), with `told` then used in place of `options` in that function, so it reaches `opening` and the `from` and `compared` lines:

```ts
const told = { ...options, reportsSpend: options.reportsSpend && outcome.spendUnknown !== true };
```

**Until that line lands, a run-derived card reads "$0.00".** That is the one place your rule is not met, and I chose it over hiding real spend from the first attempt the browser worker will read. To invert it for a while, put `reportsSpend: false` back in `results-port.ts`.

## How the chat learns to read

**Nothing needed fixing.** The chat polls. `packages/ui-components/src/chat/chat-widget.ts:370` calls `reader.read()` on every beat of `setInterval` (line 363), every 4 seconds when the tab is visible (`read-beat.ts:11`), because the extension's transport has no `changes` feed. It also reads when the thread on screen changes (line 512). So an attempt's end, and each working row, is read within about 4 seconds, and `createAnswerReader` redraws only if the outcomes changed. That is one more program call per beat while the chat is open.

No test drives the widget against this port. The two ends are tested separately.

## Commands run and observed results

Core, from `packages/fluxiq`:

```text
pnpm.cmd exec vitest run src/programs/automation-studio/api/tests/answer-first-chat-road.test.ts
  src/programs/automation-studio/api/tests/task-attempt-routes.test.ts
  src/framework/automation-service/service/answer-first/attempt-store/tests
  src/framework/automation-service/service/flow-bootstrap-requests/tests/generate-notes-thread.test.ts
  src/framework/automation-service/service/flow-bootstrap-requests/tests/generate-answer-first.test.ts
  src/runtime/conversations/commands/tests/answer-first-explore.test.ts
  src/runtime/conversations/commands/tests/answer-first-create-here.test.ts
  src/programs/automation-studio/api/handlers/tests/domain-scope.test.ts
  src/programs/automation-studio/api/handlers/tests/llm-generation.test.ts
  src/platform/iam/catalog src/programs/tests/endpoint-classification.test.ts
  src/api-contracts/automation/tests/adaptation.test.ts
  src/framework/automation-service/service/answer-first/tests/attempt.test.ts
  --minWorkers 1 --maxWorkers 2
 Test Files  16 passed (16)
      Tests  105 passed (105)

(root) pnpm.cmd --filter fluxiq check          exit 0, no "error TS" lines
(root) node scripts/structure-audit.mjs        structure-audit: passed (494 warning(s), 1097 baselined).
wc -l packages/fluxiq/src/framework/automation-service/service.ts    4304

(apps/web) pnpm.cmd exec vitest run src/app/api/programs src/lib/tests/program-route.test.ts --minWorkers 1 --maxWorkers 2
 Test Files  8 passed (8)
      Tests  111 passed (111)

(packages/ui-components) pnpm.cmd exec vitest run src/chat/ports/tests/results.test.ts src/chat/tests/results-reach-chat.test.ts --minWorkers 1 --maxWorkers 2
 Test Files  2 passed (2)
      Tests  9 passed (9)

(root) pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build   exit 0
```

The road test has teeth. I took each line out, ran it, and put the line back (`answer-first-chat-road.test.ts`, 6 tests):

| Line taken out | Result |
| --- | --- |
| `conversationId: context.conversationId` in `build.ts` | 3 failed, 3 passed |
| `answered` from the answer in `generate.ts` | 4 failed, 2 passed |
| `noteAttempt` in `store.ts` | 1 failed, 5 passed |

Extension, with `domain` built first (`pnpm.cmd --filter @fluxiq-web-extension/domain build`, exit 0; it was not built in this worktree):

```text
(root) pnpm.cmd --filter @fluxiq-web-extension/extension check     exit 0
       core-build: FluxIQ Core's build ... is current with its source.
(apps/extension) node scripts/test-extension.mjs panel/chat/transport background/automation-relay/tests
 # tests 43   # pass 43   # fail 0
(root) node scripts/structure-audit.mjs       structure-audit: passed (235 warning(s), 553 baselined).
(root) node scripts/check/core-mirror.mjs     1 mirror set(s) match
```

`--filter @fluxiq-web-extension/domain check` was not run: I changed no domain file.

## Not verified

- **Any real attempt, model, browser or Lab run.** The stub stands where `service.generateFlowBootstrapAdaptation` runs an attempt, and writes what `keep.ts` and `ending.ts` write. The real path is t861's tests.
- **The token route with a real token and the extension's real background.** Each side is tested with the other scripted. The browser worker is the first to cross it.
- **`append-turn` to `flow.createHere` in answer-first mode.** The road test starts at the command, and `extension-chat.test.ts` covers `append-turn` only in the other modes.
- **`exportRows` on an attempt's dataset.** It uses the existing route, with `runId` = the attempt's `explore.*`, and has never run on one. It also sends no `projectId`, as before, so it uses the browser's current project.
- **The whole-package suites**, per the narrow-check rule.

## Open questions and findings

1. **Run again on an attempt's card says "I can't run this one again from here."** `runAgain` knows only held runs, and an attempt's Flow holds an unapplied draft, so running that Flow would run nothing. Left for the Second Attempt lane, which owns D10.
2. **The web panel's Explore cannot read an attempt.** `apps/web/src/features/automation-studio/authoring/BlankFlowAuthoringPanel.tsx:161` looks for `adaptation`, finds `answered`, and goes to its failure path. It sends `configured`, so this happens in answer-first mode. Not on the chat's road, and outside my paths.
3. **`same_act` broke `outcome-of-run.ts`.** The other worker's new pattern made the extension's literal stop compiling, so I added the slot there, in my paths.
4. **`ui-components` failed to build once with `recovery-words.ts(124,87)`, and passed on re-run with no change.** I think it was a race with a concurrent build, but I did not establish that.
5. **My first failed `fluxiq` build deleted that package's `dist` for about six minutes** while the worktree was shared, until the rebuild. Any worker reading it then may have seen errors.
6. **No version bump.** I did not bump `fluxiq`, `@fluxiq/contracts` or `@fluxiq/ui-components`. `actions.generated.ts` is in contracts, and t861 bumped `fluxiq` at its merge.
