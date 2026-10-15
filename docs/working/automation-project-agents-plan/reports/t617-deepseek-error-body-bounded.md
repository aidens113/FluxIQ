# t617 deepseek-error-body-bounded: worker report

## Outcome

Done. A Flow-build DeepSeek call refused with a 4xx/5xx whose body never finishes now ends at its deadline. Its body is cancelled, and the step log writes `meta.json` with `error.code: "llm.provider_timeout"`. The fix uses t613's mechanism (`bounded-read.ts` + `signal-race.ts`); there is no second one. Fixing it exposed a second defect in `signal-race.ts`, which is now fixed too (below).

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/llm/`.

- **`deepseek/refusal.ts`**: `readAutomationStudioDeepSeekRefusal` takes an optional `signal` and passes it to `readAutomationStudioDeepSeekBoundedResponse`. A read that the call's deadline ended (`signal.aborted` and `llm.provider_timeout`) is rethrown, not recorded as `withheld: body_unreadable`. The call is already over, and its timeout is what gets reported. Every other read failure is still recorded in `withheld`, as before. Callers that pass no signal (the flow-bootstrap `provider-refusal.test.ts`) behave as before.
- **`deepseek/provider.ts`**: `deepSeekRefusalFailure` takes `controller.signal` and passes it to the refusal read. The existing catch already renames a signal-ended `llm.provider_timeout` for the deadline that actually ended the call (its own timer, or the parent's timeout or cancel).
- **`deepseek/signal-race.ts`** (a defect found while testing): when the signal was **already aborted** on entry and `work` had already settled (a chunk the body had buffered), `Promise.race` let `work` win. `onAbort` then cancelled the reader, the next read reported `done`, and the bounded read returned a stalled body as if it were complete.
  - Here is how this showed up. The step log's clone read of the refusal is cut off at the deadline. The refusal read then starts with the signal already aborted, gets the one buffered `\n`, and returns `bodyBytes: 1`. The step is recorded as `llm.provider_http_error`, not as a timeout.
  - The fix: an aborted signal on entry now calls `onAbort` and throws `llm.provider_timeout` without racing (`work` gets a no-op catch).
  - This also affects the success-body path of `provider.ts` and `panel-command.ts` whenever a read starts after the abort.

### Inventory of DeepSeek body reads under `runtime/llm/**`

Every `response.text()`/`json()`/`arrayBuffer()`/`getReader()` found was checked. The only body reader is `deepseek/bounded-read.ts` (`getReader`); every read goes through it.

1. `provider.ts`, success body: had a signal already (t613).
2. `provider.ts` `stepLogReply` (clone, for non-2xx or non-JSON replies): had a signal already (t613).
3. `refusal.ts` via `provider.ts` `deepSeekRefusalFailure`: **unbounded until now; fixed.**
4. `panel-command.ts`: reads every body, success or refusal, under `execution.signal` (t613). Its late-reply `releaseLateReply` only cancels and never reads.

No other module under `runtime/llm/**` reads a fetch body.

### Tests

- **`provider-retry/tests/stalled-provider.test.ts`**: the server answers 500 on `/500`. There are two new cases: 500 with headers and then a blank line every 100 ms, driven through `automationStudioLlmProviderCall`, with the signal reaching the transport and without it. The step-log assertion now waits for `meta.json` only up to deadline + 1 s, because the retry layer's race settles about one event-loop turn before the adapter's catch writes the step (measured: 0-1 `setImmediate` turns).
- **`deepseek/tests/stalled-refusal.test.ts`** (new): the chat model (`createAutomationStudioDeepSeekPanelCommandModel`) talks to a local server that sends a 500 and then blank lines forever, with and without the signal reaching the body. The test asserts `llm.provider_timeout`, the end time against the deadline, and the `meta.json` code and `ms`.
- **`deepseek/tests/refusal.test.ts`**: the refusal read ends as a timeout when its signal aborts, and the body is cancelled.
- **`deepseek/tests/signal-race.test.ts`** (new): with an already-aborted signal and settled work, the read rejects as a timeout and releases its reader. A bounded read with a buffered chunk and an aborted signal rejects as a timeout.

## Commands run and observed results

All commands were run from `packages/fluxiq` in the t617 Core worktree.

- **Before the change.** HEAD `provider.ts`, `refusal.ts` and `signal-race.ts` were swapped in, with the new tests in place, and then restored. Command: `npx vitest run .../deepseek/tests/stalled-refusal.test.ts .../deepseek/tests/signal-race.test.ts .../deepseek/tests/refusal.test.ts .../provider-retry/tests/stalled-provider.test.ts`. Result: `Tests 5 failed | 17 passed (22)`:
  - provider-retry 500 with signal: meta `error.code` was `llm.provider_http_error`, not `llm.provider_timeout`;
  - provider-retry 500 without signal: `ENOENT ... 0001-decide\meta.json`, because the adapter was still reading at deadline + 1 s;
  - refusal unit: `Test timed out in 15000ms`;
  - both signal-race cases: "promise resolved ... instead of rejecting".
  - The chat-model 500 cases **passed before the change**. `panel-command.ts` already read refusal bodies under the signal (t613), so those two cases only guard against a regression.
- **Intermediate run** (refusal and provider changes only, no `signal-race.ts` fix): the 500 case without a signal still failed. The refusal read started with an aborted signal and returned 1 byte, done, in 3 ms. Diagnosed with temporary logging (since removed). This is what led to the `signal-race.ts` fix.
- **After the change:** `npx vitest run src/programs/automation-studio/runtime/llm/deepseek src/programs/automation-studio/runtime/llm/provider-retry src/programs/automation-studio/runtime/llm/step-log src/programs/automation-studio/runtime/llm/tests/deepseek-provider.test.ts` printed `Test Files 25 passed (25)` and `Tests 232 passed (232)`. That run includes `system-prompt.test.ts`, so the prompt pins are unchanged.
- **Core tsc:** `pnpm check` in `packages/fluxiq` (`tsc --noEmit`) exited 0.
- **Structure audit:** `node scripts/structure-audit.mjs` at the Core root printed `structure-audit: passed (362 warning(s), 1156 baselined).` The only warning touching these folders is `deepseek/: 18 source files is past the 15-file advisory threshold`, which was already there; no source file was added.

## Not verified

- No live run and no real provider call. The behavior is inferred from the local stand-in server.
- Full suites were not run, per the twice-a-day rule.
- Flow-bootstrap's `provider-refusal.test.ts` (outside ownership) was not re-run. It calls `readAutomationStudioDeepSeekRefusal` without a signal, which is unchanged behavior, and tsc passed.
- When a refusal ends at the deadline, the step log has no `reply` (raw body) for it, because the clone read was cut off. This is expected and was not separately asserted.

## Open questions or contradictions found

- The brief expects the stall test to fail before the change through both paths. The chat-model path passed before the change, because t613 already bounded its refusal read. Only the `provider-retry/call.ts` path, and the new unit tests, fail at HEAD.
- The `signal-race.ts` defect also affected success-body reads that start after an abort. In practice that is the main read in `provider.ts` after a `stepLogReply` that was cut off (a non-JSON 2xx). Such a read could have returned a truncated body as complete; it now fails as a timeout.
- Architecture docs (`docs/architecture/automation-studio.md`, "A call's deadline ends its body read too") still name only `provider.ts` and `panel-command.ts` as using `bounded-read.ts`/`signal-race.ts`. The refusal read could be added there. Docs were outside this brief.
