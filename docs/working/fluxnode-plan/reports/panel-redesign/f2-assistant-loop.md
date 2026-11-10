# P9-F2: the panel-wide assistant's tool loop

Worker report, 2026-11-09.

## Outcome

Done in my paths. Every acceptance case passes under vitest with a scripted model. The fluxiq typecheck exits 0, and the structure audit shows only the violation that was already there. Three generated-file drift tests outside my paths now fail. They fail only because I added 7 endpoints, and their files have to be regenerated (see Open questions).

## What changed and why

**One structural constraint shaped everything.** The structure audit forbids `runtime/**` from importing anything under `programs/**`, `_shared` included and type imports too. So the assistant lives in `runtime/conversations/assistant/` and declares a port, `PanelAssistantPrograms`. The Studio API builds that port from `GlobalProgramApiRegistry` and `AssistantToolCatalog`. Studio is a controller program, so its functions are kept to 20 lines.

`packages/fluxiq/src/runtime/conversations/assistant/` (new). It is deliberately not re-exported from `conversations/index.ts`, because that barrel reaches browser bundles.
- `types.ts`: the shared types.
  - `PanelAssistantContext`.
  - The model port (`PanelAssistantModel` and `PanelAssistantModelSource`).
  - `PanelAssistantPrograms`.
  - `PanelAssistantSettings`.
  - The target types.
- `allowance.ts`: `PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD = 0.5` and its validation.
- `store/`: the workspace-level panel store.
  - `panel-threads.ts` (`PanelAssistantThreads`) uses the existing store class and rows, through the new `AutomationStudioProjectConversationStore.openReserved`.
  - It has its own pool at `<automation data>/panel-assistant`, one database per person. The database id comes from `database-id.ts`: `person-<sha256(userId)>`, built from the signed-in actor and never from the payload.
  - Threads read back as `subject: {kind:"panel"}` with `projectId:"panel"`.
  - `migrations.ts` has two migrations that only the reserved database runs:
    - `9001` rebuilds `conversations` so its check allows `panel`;
    - `9002` adds `panel_assistant_waiting_calls`.
  - A test fails if a project migration ever changes the columns the rebuild copies.
  - `waiting-calls.ts` keeps the exact call behind each Allow card. `take` changes it from waiting to taken in one conditional update, so a call runs at most once.
- `context/`: three pieces for where the person is.
  - The `onScreen` parser (`page`, `selection`, and the older `flowId` and `runId`).
  - The context line, for example `On Flows › “Cheapest listings”, step 5 selected.`
  - The `contextArgs` filler, which fills only fields the model left out.
- `consent/`: the words-clearly-ask check.
  - The gated classes are send, money, delete, security, and `budget` (projected spend over what is left of the allowance).
  - The class-verb table.
  - `clearly-asked.ts`: deterministic and conservative. It needs:
    1. a verb for every gated class;
    2. every target item named as a whole phrase, or pointed at by "this", "these" or "selected" and exactly the current selection;
    3. no negation, and no question unless it is phrased as a request.
  - `person-words.ts` did not fit. It joins a request across Core's clarify decisions, which panel turns do not record, so the check reads the latest person message.
  - Card words, for example `Delete the Flow “Old search”? It removes the Flow and its 12 runs.` The detail sentence comes from the target lookup when it has one; otherwise a sentence per class.
- `loop/`: the loop itself.
  - `run-turn.ts` runs on `runAgentIterations` with `maxIterations: Infinity`. Only two things bound it: the purse (the per-message allowance, which counts billed cost, including failed calls) and loop detection.
  - `call-step.ts` handles `find_tools`, `call_tool`, page tools called by name, and `panel.open` / `panel.select`. Navigation calls are returned to the dock in `clientActions` and as a `panel.client-action` attachment.
  - Every program call is posted as its own plain-words step.
  - Consequential calls are gated. When the words clearly ask, the call runs at once; a destructive endpoint gets a grant minted for exactly that call, on the person's own request. Otherwise the loop posts a `confirm` card and stops.
  - `loop-watch.ts` reuses Answer First's detector and ladder unchanged (`automationStudioLlmLoopWatch`, `runtime/llm/repeat-guard/loop-detection`):
    - the context is the thread;
    - a call's answer digest stands in for the page state;
    - a consequential call counts as a lasting act;
    - unreadable decisions and retryable model failures are watched too.
    - The ladder steers, then refuses, then stops with a plain message.
  - `prompt.ts` is generic: no task- or site-shaped example.
  - `step-words.ts` holds the plain sentences.
- `model/`: the real model.
  - `conversation-model.ts` adapts Core's Anthropic and DeepSeek panel-command adapters.
  - `key-model-source.ts` builds a model from `resolveAssistant()` (brief G). The key value is released per call with `releaseAutomationStudioSessionProviderKey(…, {flowKeyId: keyId})`.
- `panel-assistant.ts` (`PanelAssistant`):
  - open, list, read, send and answer, plus `bindModelSource`, `bindSettings`, `allowance` / `setAllowance`, `idle` and `close`.
  - A send stores the person's turn and answers at once. The work runs in the background, one message at a time per thread, and never rejects; a failure is written into the thread.
  - Allow takes the waiting call, mints a grant for it (destructive endpoints only), runs it, and the loop continues from its answer. Don't takes it and runs nothing. A repeated or retried press starts nothing.

`packages/fluxiq/src/runtime/conversations/store.ts`:
- `openReserved({pool, databaseId, migrations})`.
- `openConversation` accepts the subject kind `"panel"` through a file-private type. A project database still refuses it at its check constraint, which a test confirms.

`packages/fluxiq/src/programs/automation-studio/api/panel-assistant/` (new). It is not under `handlers/`, which is at the 25-file cap; a subdirectory there would break the 8-segment depth cap.
- `register.ts`: 7 endpoints, each `endpointResource.selfUser()` with an `assistant: {hidden}` reason. Paired clients are refused.
- `programs-port.ts`: the port. Calls go through `registry.call` with `via:"assistant"`. Grants come from `registry.mintPressGrant`.
- `call-target.ts`: the target is the most specific id in the input. Flow and project names are read through the registry as the person.
- `panel-assistant-of.ts`: `panelAssistantOf(registry)`, a lookup keyed by registry (WeakMap) so the host can bind the model and settings.
- `endpoints.ts`.

The registration is in `handlers/register.ts`: one import plus `registerPanelAssistantEndpoints(dependencies);`.

**Audit noise, fixed at its cause.** The cause was deciding tools before anything was asked: `listFor` calls `registry.authorize` for every tool, every turn. The assistant now offers the declared tools and lets `registry.call` decide each one, which is the real gate anyway. A refusal reaches the model as plain words. The audit holds exactly the calls that were made, and a test proves that no tool the model never called gets an audit row.

**Allowance setting.** `programs/secret-keys/runtime/model-key-settings.ts` gains `assistantAllowance()` and `setAssistantAllowance(usd|undefined)`. `programs/secret-keys/types.ts` gains:
- the record field `assistantAllowanceUsd?`;
- the view field `assistantAllowanceUsd: number | null`, so `get-assistant-model` now returns it.

Undefined means the assistant's default ($0.50).

### Endpoint contract (for the dock transport)

Every endpoint is program `automation-studio`. The actor comes from the session and must not be a paired client. `scope` is passed through to every tool call.

| Endpoint | Perm / class | Payload | Answer `payload` |
| --- | --- | --- | --- |
| `list-panel-threads` | programs.read / read | `{limit?}` | `{conversations: PanelConversation[]}` |
| `get-panel-thread` | programs.read / read | `{conversationId, sinceTurnId?, limit?}` | `{conversation: {conversation, turns, hasMore}}`; unknown → `ok:false` "That conversation does not exist." |
| `open-panel-thread` | programs.write / authoring | `{title?}` | `{conversation}` |
| `send-panel-message` | programs.write / authoring | `{text, conversationId?, title?, onScreen?: ChatOnScreen}` | `{conversation, turn}` (the person's turn). The work goes on in the background, and its steps, reply or Allow card appear as turns on the next read. |
| `answer-panel-ask` | programs.write / authoring | `{askId, kind:"grant"|"deny", onScreen?}` | `{ask}` |
| `get-panel-assistant-allowance` | programs.read / read | `{}` | `{allowanceUsd, chosen, defaultUsd}` |
| `set-panel-assistant-allowance` | secrets.manage / authoring | `{allowanceUsd: number|null}` | same as get |

Shapes the transport needs to know:
- `PanelConversation` is the project conversation record with `subject:{kind:"panel",id:"panel"}` and `projectId:"panel"`.
- Turns and asks are the existing rows. A card is an ask with `kind:"confirm"`; the widget labels it Yes/No today, and the design says Allow/Don't.
- A navigation step carries the attachment `{kind:"panel.client-action", ref: JSON {tool:"panel.open"|"panel.select", input}}`.

### Host binding (`programs/_shared/runtime.ts`, not mine: needed for live use)

```ts
const assistant = panelAssistantOf(api); // from programs/automation-studio/api/panel-assistant/index.ts
assistant?.bindModelSource(panelAssistantKeyModelSource({ resolveAssistant: () => secretKeys.modelKeys.resolveAssistant(), keyPorts: sessionKeyPorts, ...(instanceHost ? { instanceHost } : {}) }))
  .bindSettings({ allowanceUsd: () => secretKeys.modelKeys.assistantAllowance(), setAllowanceUsd: (usd) => secretKeys.modelKeys.setAssistantAllowance(usd) });
```

Until this binding exists, a message gets the reply "The assistant has no model on this panel yet. Add a model key in Settings." The e2e fixture host binds a scripted model through the same `bindModelSource`.

## Commands run and observed results

- `npx vitest run src/runtime/conversations/assistant src/programs/automation-studio/api/panel-assistant src/programs/secret-keys/runtime/tests/model-key-settings.test.ts` → `Test Files 11 passed (11)`, `Tests 58 passed (58)`.
- Runtime `tests/panel-assistant.test.ts` (8 cases):
  - a 3-tool chain completes;
  - the allowance stops a message ("I stopped here: this message used its spending allowance of $0.05 ($0.06 spent)…");
  - loop detection steers, then stops a repeated identical call (3 calls ran, then "I stopped because I kept repeating…");
  - "delete Old search" runs with a minted grant;
  - "clean things up" gets a card; Allow runs the call once, a second press runs nothing, and Don't runs nothing;
  - with no model, it says so.
- Program `panel-assistant/tests/register.test.ts`, against the real registry, Identity Access, IAM audit and `PressGrantStore` (6 cases):
  - the endpoint contract;
  - a 3-tool chain, audited `via:"assistant"`, with no audit row for tools never called;
  - an IAM-denied tool is refused at the call ("It was not done: Permission required: secrets.manage.", and the audit row reads deny with via assistant);
  - "delete Old search" runs once, and the handler never sees a grant;
  - "clean things up" → card → Allow runs it once with a grant → a second press does nothing → Don't does nothing → a different answer is refused;
  - a paired client is refused.
- Extension thread tests unchanged: `npx vitest run … src/runtime/conversations/tests src/runtime/conversations/instructions` plus the Studio `domain-scope` and `llm-generation` tests plus `src/platform/iam/catalog` plus `src/programs/_shared/assistant` → 22 files passed and 2 failed (3 tests). The failures are exactly the generated drift below.
- Drift in detail (`live-registry.test.ts` ×2, `generated-module.test.ts` ×1): the diff lists only my 7 new `studio:*Panel*` actions and their 7 hidden entries.
- `node scripts/structure-audit.mjs` → `structure-audit: 1 violation(s)`. The one violation is the existing `assistant-tools.generated.ts` 4705-line file-lines failure, not mine.
  - An earlier run flagged three problems of mine: an `as never` in a test, a 33-line controller function, and a packed line. All are fixed.
- fluxiq typecheck, under the lock with 5181 MB free: `tsc --noEmit --incremental …` → exit 0.
  - The first run, with 5469 MB free, found 2 errors, both in my tests: the permission `flows.read` does not exist, and an optional `name` broke `exactOptionalPropertyTypes`. Both are fixed.
  - The lock was released both times.

## Not verified

- Live provider calls and a real key release in the running panel; the host binding above is not wired.
- The web dock: transport wiring, and running `panel.open` / `panel.select`.
- Behaviour under the IAM `service` profile with real policies.
- `programs/_shared/runtime.ts` binding.
- The web typecheck.
- The contracts `dist` build.

## Open questions or contradictions found

1. **Generated files** (not my paths): regenerate the IAM catalogs (`FLUXIQ_REGENERATE_IAM_CATALOG`) and `assistant-tools.generated.ts` (`FLUXIQ_REGENERATE_ASSISTANT_TOOLS=1`) for the 7 new endpoints.
2. **Runs always ask.** Per-call run consequences are not resolved yet. `consequencesOf` uses the catalog's unresolved run target (send, money and delete), so every run gets an Allow card unless the words name all three classes. A resolver for the target Flow's lasting classes is a follow-up; its hook is `PanelAssistantPrograms.consequencesOf`.
3. **No spend projection yet.** `projectedCostUsd` returns undefined, so the `budget` gate never triggers.
4. **Grants minted on clearly-asked words.** When the words clearly ask for a destructive call, server code mints a grant on the person's own send request (no `via`). F1's design only names a press, so this needs the keys lane's adversarial review.
5. **People with a PIN.** If the person has a PIN, `mintPressGrant` refuses ("PIN is required for this action"). The assistant reports that plainly; there is no PIN flow in the chat, which is correct under the no-PIN-mid-Flow rule.
6. **Allowance scope.** The allowance is stored in the workspace-wide Secret Keys settings record, so it is per workspace, not per person.
7. **Two prompt-size choices**, neither a bound on the work: the model reads the last 100 thread turns, and 15 page tools are listed in full. `find_tools` reaches every tool.
8. **Card buttons.** The confirm card renders Yes/No in `ui-components`; Allow/Don't labels need a ui-components change.
