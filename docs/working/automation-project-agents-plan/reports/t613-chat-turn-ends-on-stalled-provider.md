# t613 chat-turn-ends-on-stalled-provider: worker report

## Outcome

Done. A chat turn now ends inside its own deadline when the model provider stalls, and it writes its usual words: "(I read your message without the model, because the model did not answer in time. ...)". A message that FluxIQ does not answer has its own 40 s deadline in the extension. When that deadline runs out, the panel says what happened instead of showing "Sending your message".

## What changed and why

### Where the hold was

The hold was in the body read of the DeepSeek attempt. It was not in the step log, the store write or any lock. The provider-free reproduction (mode "headers, then a blank line a second forever") showed this. Instrumentation found three things:

- the headers arrived at 1 050 ms;
- the attempt's timeout signal fired at 15 014 ms;
- Node's `fetch` did not end the body read. The read ended only at 43 582 ms, when the test server closed (`TypeError`).

With the step log on, `0001-chat` ran 43 640 ms and ended with `error.code: "unknown"`. That is the live `run-mv8thvte` / `run-mv8thvu5 0002-chat` picture. DeepSeek is known to send blank lines while a non-streaming request waits in its queue, so this mode is the likely live one.

A plain-Node probe ended the same read on time, even with forced GC. Node 22's bundled undici passes the caller's signal to the request's own `AbortController` through a `WeakRef` (`Request` constructor, `buildAbort(acRef)`, plus a `FinalizationRegistry` that removes the listener). My working theory is that once headers arrive, the request object can be collected, and the abort is then lost. I could not prove this. The fix does not depend on it.

### Changes in Core (`C:/Users/osrs_/FluxStuff/fxwork/t613/!FluxIQ`)

- **`.../runtime/conversations/instructions/interpret.ts`**: each attempt now runs under `attemptWithin(ms, attempt)`. This uses Core's own `AbortController` and `setTimeout`, and races the attempt against them. The model is still told to stop through its signal. The attempt ends at its budget whether or not the model listens. It throws a `TimeoutError`, which the thread reads as "the model did not answer in time" and which is retried while the deadline lasts. This replaces `AbortSignal.timeout(...)`. The limits are unchanged: 3 attempts, 15 s each, 24 s in all.
- **`.../runtime/llm/deepseek/signal-race.ts`** (new): `raceAutomationStudioDeepSeekSignal(work, signal, onAbort?)`. It rejects with `llm.provider_timeout` (retryable) when the signal aborts. It rejects before `onAbort` runs, because cancelling a reader settles its pending read at once, and that read must not win the race.
- **`.../runtime/llm/deepseek/bounded-read.ts`**: takes an optional `signal`. Each `reader.read()` races the signal. On abort the body reader is cancelled and the read throws `llm.provider_timeout`. A raw `TimeoutError` or `AbortError` from the stream after the signal fired is also named `llm.provider_timeout`, which keeps the failure code primary. Before this change the live `0001-chat` recorded `code: "unknown"`, `name: "TimeoutError"`. Callers that pass no signal (`provider.ts`, `refusal.ts`) behave exactly as before.
- **`.../runtime/llm/deepseek/panel-command.ts`**: the send races the signal, and the read passes `execution.signal`. A reply that arrives after the time limit has its body cancelled (`releaseLateReply`). The step log's `meta.json` is now written when the attempt is abandoned. With the fix, step 0001 shows `ms: 15016` and step 0002 shows `ms: 8590`, both `llm.provider_timeout`.

### Changes in the extension (`C:/Users/osrs_/FluxStuff/fxwork/t613/!FluxIQWebExtension`)

- **`apps/extension/src/background/connection/core-api.ts`**: `append-turn` has its own deadline of 40 s (`CORE_CHAT_TURN_TIMEOUT_MS`, private). That is Core's 24 s reading, plus storing the turn and starting the command, plus a margin. Every other program call keeps its 120 s. The deadline uses the call's own `AbortController` and `setTimeout`, and it covers the body read too. When it expires, the panel says: "FluxIQ did not answer your message within 40 seconds. It may still be working on it, so wait for its answer here before sending it again." (code `timed_out`). Before this change, the send waited 120 s, which is past the Lab's 60 s.
- **`apps/extension/src/panel/chat/conversation/controller.ts`**: when a send times out (`code: "timed_out"`), `sending` ends. The person's turn shows the background's sentence instead of "Couldn't send that. Try again." The outgoing turn is marked `unanswered` and the thread is read again. Core stores a turn before it reads it, so a later read that holds a new person turn replaces the panel's turn and clears the sentence. Any other failure is handled as before.

### Tests

**Core: `api/handlers/tests/chat-turn/tests/stalled-provider.test.ts`** (new). It drives the registry's `append-turn` with the real store, the real interpretation and the real panel-command model, at the production limits. The model's `fetchImpl` refuses any address but DeepSeek's and sends DeepSeek's request to a local `http` server. The key is a fixed fake. There are four cases:

- headers, then a blank line a second;
- no headers ever;
- headers, then a valid reply after 20 s;
- a transport that ignores its signal and never answers.

Each case asserts four things:

- `ok`;
- `source: "closest_match"` and `modelProblem: "the model did not answer in time"`;
- the call took less than 24 s + 4 s;
- the thread's last automation turn contains "because the model did not answer in time".

The cases run concurrently, about 25.5 s in all. The test sits in a `chat-turn/tests/` subfolder because `api/handlers/tests/` was at the structure audit's 25-file limit. This follows the `runtime/tests/deepseek-bootstrap/tests/` pattern.

**Core, other tests:**

- `interpret.test.ts`: a deaf model ends each attempt on time, and its signals are aborted.
- `panel-command.test.ts`: a stalled body and a send that never answers both end as `llm.provider_timeout`, and the body is cancelled.

**Extension:**

- `core-api.test.ts`: a local HTTP server stands in for Core, with node:test mock timers. Three cases:
  - `append-turn` is still pending at 39 999 ms and becomes `timed_out` with the sentence at 40 000 ms;
  - a reply sent after 25 s reaches the panel;
  - `get-conversation` still waits past 60 s.
- `outgoing-turn.test.ts`: a timed-out send shows the sentence and is not "sending". Core's record then replaces the panel's turn.

## Commands run and observed results

Before the fix (Core sources at HEAD, new tests in place):

- `npx vitest run src/programs/automation-studio/tests/chat-turn-stalled-provider.test.ts` (the test's first location), with the URL import fixed:
  - **blank-lines mode:** FAILED, timed out at 44 000 ms.
  - **no-headers mode:** passed, 25 764 ms.
  - **reply-after-20 s mode:** passed, 25 704 ms.
  - **deaf transport:** FAILED, timed out at 44 000 ms.
- Same file, blank-lines mode only, with `FLUXIQ_LLM_STEP_LOG_DIR` set to a scratch folder: only `0001-chat` was written, with `"ms": 43640` and `"code": "unknown"`.
- `npx vitest run .../interpret.test.ts .../panel-command.test.ts --testTimeout 5000`: 3 failed, 27 passed. The three failures were the deaf-model interpret case, the stalled-body case and the deaf-send case, each timed out.
- `node scripts/test-extension.mjs background/connection/tests/core-api` with HEAD's `core-api.ts`: the 40 s test never settled, and the run was killed at 90 s (`exit=124`). Tests 1 to 7 printed `ok`.
- `node scripts/test-extension.mjs panel/chat/conversation/tests/outgoing-turn` with HEAD's `controller.ts`: `not ok 4 - t613: ...`, `# pass 6`, `# fail 1`.

After the fix:

- `npx vitest run src/programs/automation-studio/runtime/conversations src/programs/automation-studio/runtime/llm/deepseek src/programs/automation-studio/runtime/llm/step-log src/programs/automation-studio/api/handlers/tests/conversations.test.ts src/programs/automation-studio/api/handlers/tests/chat-turn` printed `Test Files 43 passed (43)` and `Tests 410 passed (410)`.
  - The four stall cases took between 25 439 and 25 584 ms.
  - This run includes the `system-prompt.test.ts` prompt pins, which are unchanged.
- Blank-lines mode with the step log on: `0001-chat` `ms: 15016` and `0002-chat` `ms: 8590`, both `code: "llm.provider_timeout"`.
- After the margin was raised to 4 s, `npx vitest run src/programs/automation-studio/api/handlers/tests/chat-turn` printed `Tests 4 passed (4)`.
- **Core type checks:**
  - `pnpm check` in `packages/fluxiq` (tsc --noEmit) exited 0.
  - `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket build` exited 0. It rebuilt Core's dist, which the extension check needs.
- **Core `node scripts/structure-audit.mjs`:** one FAIL remains, `[working-docs] docs/working/README.md is out of date with the documents' header blocks`. It was already there before this work: this task changed nothing under `docs/` until this report.
- **Extension:**
  - `pnpm check` in `apps/extension` exited 0, after reporting "core-build: FluxIQ Core's build ... is current with its source."
  - `node scripts/test-extension.mjs background/connection/tests panel/chat background/panel/tests` printed `# tests 668`, `# pass 668`, `# fail 0`.
- **Downstream `node scripts/structure-audit.mjs`:** exit 0. A `statement-packing` failure in the new test was fixed first.

## Not verified

- No live run and no real provider call. Live behaviour against DeepSeek is inferred from the local stand-in.
- I did not prove the exact undici mechanism that drops the abort (GC of the `WeakRef`'d request controller is a theory). The fix makes both Core and the adapter independent of it.
- I did not check browser behaviour of the extension's 40 s deadline: whether an MV3 service worker stays alive during the wait, or how the panel looks. This was checked only under node:test with mock timers.
- I did not check that a late reply's cost is still counted. When an attempt is abandoned, a reply that would have priced it is cancelled, so its cost reaches neither `paid` nor the purse.
- Full suites were not run, per the twice-a-day rule.

## Open questions or contradictions found

- The brief says Node 22's `fetch` abort ends a trickling body read. That held in a plain Node probe, with and without forced GC. Under vitest, driving the real path, the signal fired at 15 s and the read went on until 43.6 s. The no-headers mode and the late-reply mode both ended in time before the fix. So only the blank-lines mode and the deaf transport fail before the fix; the two others are regression pins.
- `llm/deepseek/provider.ts` (Flow builds, diagnosis and repair) reads bodies with the same `readAutomationStudioDeepSeekBoundedResponse` and no signal, so it is likely exposed to the same stalled-body hold. It is outside this brief, so I left it alone. Passing its signal to the new optional parameter would close it.
- Neither repository's authored architecture docs were updated (for example the extension chat flow and the 40 s send deadline). They are outside this brief.
- Core's `docs/working/README.md` index is stale (structure-audit `working-docs`). It is a shared document, so the supervisor would regenerate it with `pnpm structure:baseline`.

## Follow-up: the Flow-build provider and the docs

### Outcome

Done. `runtime/llm/deepseek/provider.ts` now reads its body under the call's signal, through the same path as the chat call: `readAutomationStudioDeepSeekBoundedResponse(..., signal)`, which uses `signal-race.ts`. There is no second mechanism. A stall test drives the provider through `provider-retry/call.ts`. The authored docs in both repositories describe the change.

### What changed and why

#### `deepseek/provider.ts`

- **Main body read:** reads under `controller.signal`. That is the call's own controller, aborted by its `timeoutMs` timer or by the caller's signal.
- **Step log's copy:** the copy of a non-JSON or non-2xx reply (`stepLogReply`) is read under the same signal.
- **Failure codes:** when the race ends a read with `llm.provider_timeout` while the controller is aborted, the existing mapping renames it for whichever deadline actually ended the call:
  - this request's timer gives "DeepSeek did not respond before the request timeout." (`llm.provider_timeout`, retryable);
  - the caller's signal gives `parentSignalFailure`. That is `llm.provider_timeout` when the caller's signal timed out, and `llm.provider_aborted` when it was cancelled. So a person cancelling is never reported as a timeout.

#### Tests: `llm/provider-retry/tests/stalled-provider.test.ts` (new)

This drives the real DeepSeek provider through `automationStudioLlmProviderCall`:

- the request deadline is `timeoutMs: 1500`;
- `fetchImpl` sends DeepSeek's request to a local HTTP server that sends headers and then a blank line every 100 ms forever;
- the secret is fake, and any other address is refused;
- the reply is rewrapped without its URL, because the adapter refuses a reply from anywhere but DeepSeek's endpoint;
- the step log goes to a temporary folder.

Each case asserts the following:

- the call ends in less than its deadline plus 1 s;
- the failure is `llm.provider_timeout` with `retryable: true`;
- the retry layer stops with `not_retryable` after one attempt (`decision.ts` deliberately leaves timeouts to the evidence loop);
- the step's `meta.json` exists, with `status: "error"`, `error.code: "llm.provider_timeout"` and `ms` under the deadline plus 1 s.

There are two cases:

- **Signal passed to `fetch`:** passes before and after the fix. Here Node's `fetch` abort did end the body read, and the retry layer's own race would have ended the call anyway. It is a regression pin.
- **Signal not reaching the transport's body (the live symptom):** the fetch to the server is made without the signal. Before the fix (HEAD `provider.ts`) it failed with `ENOENT ... 0001-decide\meta.json`: the retry layer's race ended the call, but the adapter read on and never finished its step. After the fix it passes.

#### Docs

- **Core `docs/architecture/automation-studio/client-gateway.md`** (conversation commands): a new bullet on the reading deadline. It covers the 3 attempts of 15 s within 24 s, the fact that each attempt ends on Core's own timer, the DeepSeek chat call ending its send and read with the signal (`llm.provider_timeout`), and the extension's 40 s.
- **Core `docs/architecture/automation-studio.md`**: a new paragraph, "A call's deadline ends its body read too". It covers DeepSeek's queued blank lines, the shared `bounded-read.ts` / `signal-race.ts` path for `provider.ts` and `panel-command.ts`, and the retry seam still seeing a retryable timeout.
- **Downstream `docs/architecture/extension-client.md`**: the "panel relay that runs out of time" paragraph now covers:
  - the 40 s `append-turn` limit, against two minutes for other calls;
  - why 40 s;
  - that the limit is the call's own timer and also ends the body read;
  - the panel's wording, which replaces "Couldn't send that";
  - the thread read that replaces the panel's turn and clears the sentence.

A related observation, not proven: the hang in the chat path used `AbortSignal.timeout(...)` (interpret's old signal). This Flow-provider path uses an `AbortController` aborted by `setTimeout`, and Node's `fetch` honoured it here, including with a 15 s deadline in a one-off check. That one-off check had 100 ms ticks, because the sed edit that was meant to change them to 1 s did not apply. This fits the `WeakRef` theory above, but it is a correlation.

### Commands run and observed results

- **Before the fix:** HEAD `provider.ts`, `npx vitest run .../provider-retry/tests/stalled-provider.test.ts`:
  - `× ... ends at its deadline even when the signal does not reach the transport's body` with `ENOENT: ... 0001-decide\meta.json`;
  - `Tests 1 failed | 1 passed (2)`.
- **Same run, after the fix:** `Tests 2 passed (2)`.
- **Same file, one-off, 15 s deadline, HEAD `provider.ts`, signal reaching the body (100 ms ticks):** `1 passed`, 15 082 ms.
- **The requested vitest sets:** `npx vitest run src/programs/automation-studio/runtime/llm/deepseek src/programs/automation-studio/runtime/llm/provider-retry src/programs/automation-studio/runtime/llm/step-log src/programs/automation-studio/runtime/conversations src/programs/automation-studio/api/handlers/tests/chat-turn src/programs/automation-studio/api/handlers/tests/conversations.test.ts src/programs/automation-studio/runtime/llm/tests/deepseek-provider.test.ts` printed `Test Files 48 passed (48)` and `Tests 466 passed (466)`. That includes `system-prompt.test.ts`, so the prompt pins are unchanged.
- **Core type check:** `pnpm check` in `packages/fluxiq` exited 0.
- **Core `node scripts/structure-audit.mjs`:** only `[working-docs] docs/working/README.md` remains, which the supervisor regenerates. `--rule docs-links` printed "passed".
- **Downstream `node scripts/structure-audit.mjs`:** exit 0.

### Not verified

- **Refusal-body read:** `deepSeekRefusalFailure` reads a non-2xx body through `refusal.ts`, which takes no signal. A refusal body that stalls would still hold the adapter until the server lets go. The retry layer's race still ends the call at its deadline. `refusal.ts` is not in this brief.
- **Extension check:** not re-run after the docs-only downstream change; no code changed since the last passing `pnpm check`.
- **Live and full suites:** no live run; full suites were not run.
