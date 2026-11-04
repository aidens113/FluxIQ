# Work header and each step told once (worker report)

## Outcome
Done. The work header exists, is tested and styled, and the step dedup is in. It is not wired into chat-widget.ts (the lead's job, below). Two failures remain that are not mine: `view/tests/styles.test.ts` (the answer worker's `answer-*` classes have no CSS yet) and tsc errors in `view/thread-view.ts` and `testing/results/port.ts` (other workers' in-progress edits).

## What I built
New `packages/ui-components/src/chat/work-header/` (barrel `index.ts`, tests in `tests/`):
- `format-elapsed.ts` `formatElapsed(ms)`: "12s", "1m 12s", "1h 05m".
- `cost-words.ts` `costWords(usd, budgetUsd)` returns `{ text: "$0.34 of $5.00" or "", limit: "" | "Close to the limit" (>= 80%) | "At the limit" }`; also `NEAR_LIMIT`.
- `elapsed-clock.ts` `createElapsedClock()`: starts from the first event's `at` (never in the future), else when first shown; a send's start is kept when work arrives; the host's `startedAtMs` overrides; a new unit restarts.
- `work-header-model.ts` `workHeaderModel(input)` (no DOM) with types `WorkMeter`, `WorkHeaderInput`, `WorkHeaderModel`.
- `work-header-view.ts` `createWorkHeaderView({ controls, onAction, now? })` returns `{ element, update(next), destroy() }`.

## Wiring the lead must do in chat-widget.ts
```ts
import { createWorkHeaderView } from "./work-header/index.ts";
const header = createWorkHeaderView({ controls: [hold.element, stop.element], onAction: /* the existing onLiveAction */ });
const dock = createElement("div", { className: "chat-dock" }, [header.element, composer.element]);   // replaces runControls
// each render, AFTER stop.update(live, ...) and hold.update(live) (the header reads whether Stop is offered from stop.element.hidden):
header.update({
  display: activity.display, activity: activity.current, sending: state.sending,
  questionElsewhere: answerIn !== null && !state.turns.some((t) => t.ask?.status === "pending"),   // the value passed to liveLineModel today
  meter
});
// on teardown: header.destroy()
```
- Remove `runControls`, the `liveLineModel(...)` call and the live line from thread-view (`createLiveLine`, `liveLine.update`, `onLiveAction`). Then delete live-line.ts / live-line-model.ts with their exports, and the `.chat-live*` and `.chat-run-controls` CSS (I left them in place).
- `meter`: the host reads the `working` attempt's `ChatTaskAttempt.spend.usd` and `budget.usd` through the results port and passes `{ usd, budgetUsd, startedAtMs? }`. Omit it (or pass `{}`) when there is none, and the cost segment is absent. Where the results port says `reportsSpend === false` the spend is zero filler, so do not pass `usd`. I changed no contracts or ports.

## Hooks kept / renamed
Kept, none renamed: `chat-stop`, `chat-stop-control`, `chat-stop-status`, `chat-hold*` (same elements, now inside the header); button text "Stop" / "Stopping…"; aria-label "Stop build" / "Stop run". The `chat-live*` hooks go away when the lead removes the live line, since the header replaces them. New hooks: `chat-work-header` (data-state working|waiting|sending, data-near-limit), `chat-work-label`, `chat-work-time`, `chat-work-cost`, `chat-work-limit`, `chat-work-controls`, `chat-work-now`, `chat-work-action` ("Show the question"). A Lab selector that reads `.chat-live-headline`, `.chat-live-detail` or `.chat-live-step` needs `chat-work-label` / `chat-work-now` instead (I did not search the Lab).

## Each step told once: what changed
- Steps done again before a retry were a closed dropdown that opened to show every card a second time. They are now ONE plain line ("Did 3 earlier steps again: ...") with no details element and no cards (`view/done-again-view.ts`, `.chat-again` CSS). Each step stays in the chat once, where it happened, and nothing hides behind a click.
- Routine retries are quiet: `stream/step/superseded.ts` now also marks a failed, named step `superseded` (neutral "settled" look, words kept) when the same act on the same thing is done later in the same unit. Before, only failed test steps after a passed check were calmed. A failure with nothing later, a different thing, or only another unit's retry stays red. The "worked on the 2nd try" fold (`retried.ts`) is unchanged.
- The header carries only state and the current step line (`Step N of M` plus Core's latest sentence), never a copy of a step message. While waiting it says what it waits for once (the headline after "Waiting for you:"), not the ask's own sentence, which lives in the stream with its buttons.
- Proof: `tests/done-again-view.test.ts` (rewritten: a `p`, not `details`; zero `chat-card`; same element as steps join), `stream/step/tests/superseded.test.ts` (2 new tests), `work-header/tests/work-header-model.test.ts` ("waiting says what it waits for once").

## Decisions and things to know
- Kept, and flagged: `card-repeats.ts` still folds identical refusals/failures into one card with "(3 times)", and `retried.ts` keeps "Done on the 2nd try". Both are one telling with a count on the same card, not a collapse of different steps, so I judged them consistent with "told once". If the user's "never a count" rule reaches them, that is a separate decision.
- The "Robot check: Waiting for you" action card still sits in the stream beside the ask sentence (stream-items and ask territory, which I may not touch). The header no longer repeats it, but card plus ask sentence remain two tellings in the stream.
- Elapsed time keeps ticking while waiting for the person (total time of the task).
- The header shows whenever the model has words or Stop/Take over is offered, so a Stop is never hidden.
- The time uses tabular numerals and `min-width: 4.5ch`. When Take over is offered, the controls move to their own row (`:has`, Chromium and Firefox 121+).
- The state words and the step line are `aria-live="polite"`; time and cost are in no live region (tested).

## Commands run and observed output (from packages/ui-components unless stated)
- `pnpm.cmd exec vitest run src/chat/work-header src/chat/stream src/chat/tests/done-again-view.test.ts --minWorkers 1 --maxWorkers 2 --reporter=dot`: 22 files, 149 tests passed.
- Acceptance run `pnpm.cmd exec vitest run src/chat/work-header src/chat/controls src/chat/view src/chat/stream --minWorkers 1 --maxWorkers 2 --reporter=dot`: 31 files passed, 1 failed (`view/tests/styles.test.ts`); 210 tests passed, 1 failed. The failure lists only `answer-*` classes (for example `answer-check-words`, `answer-row`) built by the concurrent answer worker without CSS yet; none are mine.
- The same plus `src/chat/tests/live-run-display.test.ts src/chat/tests/in-place-updates.test.ts src/chat/tests/done-again-view.test.ts`: 34 files passed, 1 failed (the same styles test).
- `pnpm.cmd --filter @fluxiq/ui-components check` (Core root): fails with errors in `view/thread-view.ts(73)` and `testing/results/port.ts(51, reportsSpend)`, other workers' files in progress. My own `waiting_person` phase errors were fixed to `waiting_permission`; a later `tsc --noEmit` shows no error in my files.
- `node scripts/structure-audit.mjs` (Core root): 2 violations, both in `chat/answer/` (28 files; 11 share the `answer-` prefix), the answer worker's. Nothing from `work-header/`; no baseline touched. Advisory warnings: `view/` 25 files and `stream/step/` 16 files (already over before).

## Not verified
- No wiring, so no end-to-end render, no browser and no look at 360 px (CSS written with tokens, not seen). The `:has` row and the grid wrap are unchecked in a browser.
- The Lab's selectors for `chat-live-*` were not searched.
- `chat-widget.test.ts` and `chat-run-controls.test.ts` still reflect the old dock until wiring; I did not run the whole chat suite.
- Whether `ChatTaskAttempt.spend` updates often enough to feel live.
