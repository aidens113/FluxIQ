# Answer turn view (t862)

## Outcome
Done. `packages/ui-components/src/chat/answer/` exists with model, view and reader. The stream, thread view, lease transport and CSS are wired. `chat-widget.ts` is untouched, so the lead still has to wire it.

## What changed and why
New directory `src/chat/answer/`, with a barrel in each directory:
- `words/` holds pure phrases: durations ("1m 12s"), dollars ("$0.34"), acts, site, saved, spend, compared, from, waiting.
- `model/` holds `answerModel(outcome, {reportsSpend, canAddBudget})`, which returns an `AnswerModel` or undefined. It also holds `hasAnswerTurn`, the check words, and the rows model.
- `view/` holds `createAnswerView(host)`, the head, body and foot builders, the handlers, and `AnswerHost`.
- `reader.ts` holds `createAnswerReader`.
- `tests/` holds `model.test.ts`, `view.test.ts` and `reader.test.ts`.

Edits outside `answer/`:
- `stream/stream-items.ts`: a new item kind `{kind:"answer", key:"answer:<attemptId>", at, outcome}`. `buildChatStream` gained a 4th parameter, `outcomes = []`.
- `view/thread-view.ts`: `ThreadViewOptions.answers?: AnswerHost`. The render loop now uses `flatMap`, and answers live in a `Map` that is reconciled and cleaned up like turns and steps.
- `lease-transport.ts`: forwards `reportsSpend`.
- `chat/index.ts`: public exports for the answer module.
- `chat.css`: one block appended at the end, between `/* === answer turn ...` and `/* === end answer turn === */`. I re-grepped afterwards and the other worker's `.chat-live` rules still exist.
- `testing/results/port.ts`: this was a necessary fix. Your port-level `reportsSpend?: false` broke the typecheck, because `FakeChatResultsPort` was `Required<ChatResultsPort>`. The type is now `Required<Omit<...,"reportsSpend">> & {readonly reportsSpend?: false}`, and `createFakeChatResultsPort({reportsSpend: false})` is supported.
- New tests: `stream/tests/answer-items.test.ts`, `view/tests/thread-answer.test.ts`, and a `reportsSpend` test appended to `tests/lease-transport.test.ts`.

## API the lead must wire
```ts
import { createAnswerReader, createAnswerView, answerModel, hasAnswerTurn,
         type AnswerHost, type AnswerReader } from "../answer/index.ts"; // also exported from chat/index.ts

const reader = createAnswerReader(transport.results /* leased, may be undefined */,
  () => ({ projectId, conversationId }) /* or undefined */, () => redraw());
await reader.read();        // call on thread open, on each poll or push, and after onChanged
reader.outcomes();          // readonly ChatTaskOutcome[], oldest first

const stream = buildChatStream(turns, events, CHAT_STEP_MESSAGE_LIMIT, reader.outcomes());
createThreadView(onLiveAction, { attachments, meta, answers: host });
// thread.render(stream, live, controls, working) takes the same arguments as before. The answers come in through the stream and the view options.

type AnswerHost = {
  results?: ChatResultsPort;                 // exports, Run again, Add budget; also read for reportsSpend
  onWhatIDid?(attemptId): void;              // scroll to or reveal the step messages; never fold them
  onKeepGoing?(attemptId): void; onTellMore?(attemptId): void; onStop?(attemptId): void;  // the host's, never the runs port
  onChanged?(): void;                        // called after a successful Run again or Add budget; the host should call reader.read()
};
```
Each button is drawn only if its callback or port method exists. Without `results` there is no CSV, JSON or Run again button.

## Decisions
- **Headline.** "Found N of N" appears only for a confirmed rows result. Unconfirmed or refuted results say "Found N rows", so there is no claim without a check.
- **Stuck in a loop.** The fake `stuckInALoop` holds only `missingWhat`, with no rows, text or acts. That counts as "nothing to show yet", and it shows the Missing line. A stuck outcome with rows says "Here is what I have so far."
- **Budget-out lines.** The turn says "It spent $5.00 of $5.00." (only when spend is real) and "What I got: 3 rows." (or "I did not get a result yet."). The result is shown with its own check state, so an unconfirmed result has no tick. If there is no `saved` record it says "Nothing saved yet."
- **Add budget button.** The amount is `attempt.budget.usd`. When `reportsSpend === false` the button reads "Add budget and carry on" with no amount.
- **Failed read.** A failed read after a good one for the same thread keeps the earlier outcomes. A failed first read gives no turn, `unsupported` gives none, and a different thread starts empty. A reply for a thread the reader has since left is dropped. This departs slightly from "failure = no turn", to avoid answers flickering away on a network blip. It is one line in `reader.ts` to make it strict.
- **Placement.** An answer is placed at `attempt.endedAtMs`, or at the latest item's time if the attempt has not ended (a wait). It sorts after equal times.
- **"Checked:" line.** Confirmed results say "Checked: <checkedWhat>". Unverified results say "Meant to check: ...". Refuted results say "What failed: ...".
- **Redraw.** The card is rebuilt only when `JSON(model, state)` changes. The `li` is stable, "Show all" state and the status line persist, and a focused button's `data-action` is re-focused after a redraw.
- **Status line.** Export, Run again and Add budget show their result in one status line (`role=status`, or `alert` on failure). Buttons are disabled while busy.

## Commands and observed results
- `pnpm.cmd exec vitest run src/chat/answer src/chat/stream src/chat/view src/chat/tests/lease-transport.test.ts --minWorkers 1 --maxWorkers 2 --reporter=dot`
  - Result: "Test Files 33 passed (33), Tests 234 passed (234)".
  - The earlier run had 2 failures, which I fixed: the stuck-loop wording expectation, and CSS rules missing for `answer-check-words` and `answer-row`.
- `pnpm.cmd --filter @fluxiq/ui-components check` from the Core root: tsc passed (step `ui-components:check` stored, no errors).
- `node scripts/structure-audit.mjs`: "structure-audit: passed (488 warning(s), 1097 baselined)." No baseline edits. The first attempt failed on the 25-file limit and the "answer-" prefix rule; I fixed that by splitting into `words/`, `model/` and `view/`.

## Not verified
- No real browser at 360 px. CSS is token-only with an overflow-scroll table region (`tabindex=0`), but it was never rendered. Tests use the fake DOM.
- Focus restore after a redraw uses `document.activeElement`, which the fake DOM does not model. It was not exercised.
- `chat-widget.ts` wiring, "What I did" scrolling, and real adapters are not covered. `results-reach-chat.test.ts` was not rerun.
- I did not check the dark-theme colours of the new CSS.

## Open questions
- `Show N rows` (not "Show all") is the label when the preview is smaller than the total. Is that wording OK?
- The lead's `ChatResultsPort` doc says the budget-out amount is "the same as attempt.budget.usd". I assumed that matches Core's meaning of "add the same budget again".
