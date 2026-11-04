# Extension adapter for the answer turn (t862)

## Outcome
Done. All acceptance checks pass. The adapter and the Core first-reply wording are built.

## What changed and why
Extension, `apps/extension/src/panel/chat/transport/`:
- `ports/results/` (new directory, barrel `index.ts` exports `resultsPort`):
  - `results-port.ts`: `resultsPort(request, listen, download, now?) : ChatResultsPort`, with `reportsSpend: false`. No `addBudgetAndCarryOn`.
  - `finished-run-of.ts` (a push that is a run, `final`, phase `done`, not `stopped`, to a `FinishedRun`), `conversation-of-push.ts`, `finished-run.ts` (type).
  - `outcome-of-run.ts`: `runDetail`, then `exportDataset` with format json, then a `ChatTaskOutcome`.
  - `dataset-rows.ts` (JSON export to columns and the first 50 rows; throws on a body that is not a list of row objects), `column-label.ts` (`unit_price` or `unitPrice` becomes "Unit price"), `read-export.ts`.
  - `thread-outcomes.ts` (type) and `create-thread-outcomes.ts`: in-memory only, never persisted.
- `ports/index.ts` exports `resultsPort`.
- `create-extension-chat-transport.ts`: now `(request, listen = listenToRuntime, download: ChatDownload = downloadFile)` and wires `results`. `downloadFile` is the automations panel's existing blob + anchor helper (imported through its barrel).
- Tests: `ports/results/tests/results-port.test.ts` (10 tests). I also edited the existing `tests/subscribe.test.ts`: the results port keeps its own runtime listener for the transport's life, so the "after unsubscribe" count now compares against the count before subscribing (it asserted 0).

Core (wording only): `packages/fluxiq/src/runtime/conversations/commands/create-here.ts` `announce` is now one text for both branches: "I'll do this on ${place} and show you the result here. I'll save how I did it, so next time is quicker." Tests updated to the new text: `programs/automation-studio/api/tests/extension-chat.test.ts` (3 asserts), `runtime/conversations/instructions/tests/respond-to-turn.test.ts` (1 assert). The other `make you a new automation` hits are seeded text in other tests, left alone.

## Exported API for the lead
```ts
resultsPort(request: PanelStore["request"], listen: RuntimeListen, download: ChatDownload, now?: () => number): ChatResultsPort
createExtensionChatTransport(request, listen?, download?): ChatTransport   // now with `results`
```
Port behaviour:
- `readThread({projectId, conversationId})` waits for any outcome still being read, then returns the outcomes of that thread, oldest first. A run whose push named no conversation belongs to the latest conversation any push of its project named.
- `readAttempt` returns one outcome, or a failed result "I do not have that result in this session."
- `exportRows` reads the whole file (the format asked for) through `exportDataset` and hands it to `download(fileName, contentType, body)`. A too-large file, a failed export or a throwing download is a failed result.
- `runAgain({projectId, taskId})` finds the outcome by `taskId` (`task-<runId>`). If it has a flowId it sends the existing `AUTOMATION_PANEL_MESSAGES.runAutomation` with that flow and answers `attempt-<newRunId>`; otherwise it fails with `unsupported: true`.

Outcome shape (one per succeeded run with a dataset):
- Attempt: `taskId task-<runId>`, `attemptId attempt-<runId>`, `ordinal 1`, `path run_flow`, `status achieved`, spend all zeros except `ms` (finished minus started), `budget.usd 0`, `liveSteps 0`, no `simulation`, `flowId` from the summary.
- Result: `kind rows`, `source flow`, `acts []`, and no `answerText`, `checkedWhat`, `from` or `saved`.
- Rows: `previewRows` are the first 50 rows. `totalRows` is the larger of the export's row count and the dataset's `recordCount`. `columns` are the field ids the kept rows carry, labelled in plain words. A key that cannot be a column id is dropped from every row.
- Label: `unverified` with `timesChecked 0`.

## Which run facts could and could not be read
Read:
- From the activity push: run id, project id, flowId, conversationId, `final`, `phase`, `stopped`.
- From `runDetail`: status, startedAt, finishedAt, flowId, datasets (id, recordCount).
- From `exportDataset` json: the rows.

Not available:
- Spend and calls: the summary exposes none to the panel.
- Any result-check verdict: the run summary has no such field today. The reader looks for `summary.resultCheck.status === "confirmed"` on the raw summary and labels `confirmed`, `timesChecked 1`. That is a placeholder name I chose, not an existing Core field, so in practice every label is `unverified` until Core writes attempt records.
- Column labels: the json export carries field ids only (the csv header has the real labels), so labels are humanised ids.
- A page or site name for `from`.

## Decisions
- No `saved` chip: a succeeded run of a flow does not prove "saved so next time is quicker", so none is claimed.
- A run that is not `succeeded`, or has no dataset, gives no outcome (no invented text). A dataset with zero rows still gives a rows outcome with 0 rows.
- Too-large dataset: an outcome with `truncated: true`, empty columns and preview, and `totalRows` from `recordCount`. Having more than 50 rows does not set `truncated`; the count says it.
- `runAgain` uses `runIntent explore_and_adapt` (that is what the relay's `runAutomation` sends), so a changed page may be repaired with the person's own model key.
- Contract tension to flag: `achieved` with `unverified` fails Core's `checkAutomationStudioTaskAttemptResult` (`achieved_not_confirmed`). The brief asked for it and the chat port does not run that check. When Core writes real attempts this adapter goes away.
- Per-run memory is session-only. The results listener lives as long as the transport and is never unsubscribed.

## Commands run and observed results
- Core: `pnpm.cmd exec vitest run .../respond-to-turn.test.ts .../extension-chat.test.ts` first showed 2 failures (my first edit of the old text), both from old wording. After fixing, the extension-chat file passed: `Test Files 1 passed (1), Tests 15 passed (15)`. respond-to-turn passed in the first run (`1 passed` file).
- `node scripts/structure-audit.mjs` (Core): `structure-audit: passed (488 warning(s), 1097 baselined).`
- Extension, from apps/extension: `EXTENSION_TEST_BUILD_LABEL=t862 node scripts/test-extension.mjs panel/chat/transport` gives `# tests 22 # pass 22 # fail 0` (12 existing, 10 new).
- Core libs rebuilt with the contracts, fluxiq, client-gateway-websocket and ui-components build command; `pnpm.cmd --filter @fluxiq-web-extension/domain build` ran; then `pnpm.cmd --filter @fluxiq-web-extension/extension check` gives `core-build: ... is current with its source.` followed by `extension:check` with no errors. Note: another worker was editing `packages/ui-components` while I ran this, so the guard reported Core "stale" twice. I rebuilt ui-components again until it was current.
- Extension `node scripts/structure-audit.mjs`: `structure-audit: passed (234 warning(s), 553 baselined).` No new baseline entries. The first audit run found 3 violations in my files (failure-as-empty, statement-packing, swallowed-failure); I fixed them.

## Not verified
- Not run in a real browser or against a live Core. The `exportDataset` and `runDetail` reply shapes come from the existing readers and the Core encoder source, and the tests use scripted replies.
- The outcomes were not run through Core's `parseAutomationStudioTaskResult` or the attempt parser. I built them to the contract's rules (ids, field-id pattern, preview limits) by reading the parsers. The package fakes' own contract test was not run.
- The final activity push for a chat-started run was assumed to carry `conversationId`, `final: true`, phase `done`, as the brief said. Not seen live.
- The first reply wording was tested only in Core's unit tests, not in the extension chat.
- `chat-panel.ts` was not touched, so the chat does not yet call anything on `results`.
