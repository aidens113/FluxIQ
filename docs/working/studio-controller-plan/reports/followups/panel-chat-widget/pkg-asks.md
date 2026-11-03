# pkg-asks: asks and PIN, attachments and panel records, turn meta, pending banner, composer options, notice

Worker report. Worktree `C:/Users/osrs_/FluxStuff/fxwork/t852/!FluxIQ`, package `packages/ui-components`. Nothing committed.

## Outcome

Done. Everything is additive: with none of the new options passed, the widget draws and behaves as before and every existing test passes unchanged (75 files, 484 tests before; 80 files, 520 tests now). One test-support file was adjusted (see "Deviations", item 1).

## What changed and why

- `conversation/core-thread.ts`: `CoreAsk.record?: unknown` (Core's record as it came, read by nothing but `asks.present`), `CoreTurn.attachment?: ChatAttachment` read with a checking reader (kind and ref must be non-empty strings; anything else is no attachment and the turn still reads).
- Asks. `conversation/presented-ask.ts` draws a pending ask in the host's words: title, lead, consequences list labelled "Consequences requiring approval", note, buttons by tone (`data-tone`, hover from `description`), or a textarea (`maxlength` from `textMax`, label "Your answer", hint) with "Send answer". `ask-controls.ts` calls it when `context.presented` is non-null and the ask is pending; a settled ask keeps the chat's sentence. An action with `reauthorize` calls `context.reauthorize(action)`; without a dialog in the port those actions give way to "Answer this in FluxIQ." and the open control (`purpose: "ask"`), and the actions that need no PIN (a refusal) stay. The text box keeps typed words across rebuilds of the controls (`context.draft`, held per turn by `message-view.ts`) and empties only when the answer's outcome is ok.
- `view/turn-controls.ts` (extracted from `chat-widget.ts`, which is how it stays under budget): `createTurnControls(deps)` builds each turn's ask context and `place`. `reauthorize` calls `asks.reauthorize({ ...words, submit, cancel })`; `submit(pin)` re-checks the turn is still eligible, then `controller.answer(askId, kind, value, { authorizationPin: pin })`, answering `{ ok: true }` or `{ ok: false, error }` so the host's dialog stays open and says why; `cancel` sends nothing. The PIN is a parameter of that one call: not in state, `answerErrors`, the turn-state signature, or a log.
- `conversation/controller.ts`: `answer(askId, kind, value?, extra?)` resolves to `AnswerOutcome` and sends `turn: { conversationId, turnId, attachment? }` plus `authorizationPin` only when given. An answer made with a PIN does not write `answerErrors` (the dialog says it). A send or an answer that went with a `problem` sets `state.notice`; cleared by the next send, the next answer, a target change and a disconnect. `conversation/answer-outcome.ts` and `conversation/problem-of.ts` are the small parts.
- `view/notice-line.ts`: the notice line (`p.notice`), in the chat column right after the read notice.
- Attachments. `view/attachment-view.ts` (reading / failed / kept-outside / drawn, paperclip, ref in `<code>`, Open when the port has `open`; one read when the view is made; a read landing after `place.current()` went false is dropped; a read or drawer that throws is "could not be read here"). The read value is unwrapped from `{ attachment: { attachment, payload } }` or taken as is, and an undefined payload is a failed read. `view/message-view.ts`: a record turn (`isRecord`) is `data-author="fluxiq"` with a quiet `chat-record` line and no attachment; `isHidden` kinds draw no attachment (the turn's words stay); the attachment view is made once per turn and survives re-reads (keyed by kind and ref). `view/thread-view.ts` gets `ThreadViewOptions { attachments?, meta? }`, `turnElement(turnId)`, `data-turn-id` on each turn, the attachment in its signature, and `aria-live="polite"` on the stream (no existing test objected, so it is unconditional).
- `view/turn-meta.ts` and `turnMeta`: a visually hidden `<header class="chat-sr-only">` with author ("You", "FluxIQ", "FluxIQ panel" for a record) and `<time>`, plus the turn's `title`; step messages get the title only (`step-message-view.ts`, `createStepMessageView(meta?)`).
- `view/pending-banner.ts`, `view/show-turn.ts`, `pendingBanner`: the banner sits over `main`, hidden unless the newest turn with a pending ask exists (and the fallback is not shown). Show me calls `showTurn(scroller, turnElement)`, which adds the difference between the two boxes' `getBoundingClientRect().top` to the transcript's own `scrollTop`; never `scrollIntoView`, because the page behind a floating window would move too (the old code's reason).
- Composer: `composer: ChatComposerOptions { maxLength, remainingHintBelow, keepDraft, sendHint }` (`conversation/chat-composer-options.ts`). `maxLength` sets `maxlength`; the hint `p.composer-hint` "N characters left." exists only with both `maxLength` and `remainingHintBelow` and shows under the threshold; `keepDraft: false` uses `conversation/draft-memory.ts`, which touches no storage; `sendHint` is the send button's title.
- `chat-widget.ts` (633 lines, was 647): options passed on, `notice`, `banner`, `threadOptions`, `turnControls` built by `createTurnControls`, key line's control passes `purpose: "model-key"`. `widget/options.ts` gains `asks`, `attachments`, `turnMeta`, `pendingBanner`, `composer`.
- `chat.css`: new rules only, existing tokens only (`--accent-soft`, `--accent-text`, `--danger`, `--danger-text`, `--warning-soft`, `--warning-text`, `--divider`, `--muted`, `--surface`, `--text`, `--focus`, `--code-bg`, `--chat-mono`).

## Exact new exports and signatures

- `chat/conversation`: `presentedAskControls(presented: ChatAskPresentation, context: AskControlsContext): HTMLElement[]` (internal to the directory, not in the barrel); `AnswerOutcome = { ok: true } | { ok: false; error: string }`; `problemOf(value: unknown): string | undefined`; `ChatComposerOptions`; `memoryDraftStorage(): DraftStorage` (internal). `AskControlsContext` gains optional `presented`, `reauthorize(action: ChatAskAction): void`, `draft: { text: string }`; its `answer` now returns `unknown`.
- `ConversationController.answer(askId: string, kind: string, value?: string, extra?: { authorizationPin?: string }): Promise<AnswerOutcome>`; `ConversationState.notice?: string | undefined`.
- `CoreAsk.record?: unknown`; `CoreTurn.attachment?: ChatAttachment`.
- `chat/view` barrel: `createAttachmentView(port: ChatAttachmentPort, attachment: ChatAttachment, place: AttachmentPlace | undefined): AttachmentView`; `AttachmentPlace = { projectId; conversationId; turnId; current(): boolean }`; `createMessageView(author, options?: MessageOptions)` with `update(turn, signature, ask, place?)`; `MessageOptions = { attachments?, meta? }`; `createNoticeLine(): NoticeLine`; `createPendingBanner(show: (turnId: string) => void): PendingBanner`; `showTurn(scroller: HTMLElement, target: HTMLElement | undefined): void`; `createThreadView(onLiveAction?, options?: ThreadViewOptions)`; `ThreadView.turnElement(turnId)`; `TurnControls.place?`; `TurnMeta = { formatTime(ms: number): string }`; `createTurnControls(deps: TurnControlsDeps)`; `createStepMessageView(meta?: TurnMeta)`.
- `ChatWidgetOptions`: `asks?: ChatAskPort; attachments?: ChatAttachmentPort; turnMeta?: TurnMeta; pendingBanner?: boolean; composer?: ChatComposerOptions`. `chat/index.ts` also exports `AnswerOutcome`, `ChatComposerOptions`, `TurnMeta`.
- Ports unchanged.

## Deviations and decisions

1. `chat/tests/message-transport.ts` (test support): its `answer` spread the whole `ChatAnswer` into the old extension-era message, so the new `turn` field broke an existing deepEqual in `controller.test.ts`. It now maps only `askId, kind, value, projectId`, the message the relay took before. No test file was edited.
2. File names: `presented-ask.ts` and `chat-composer-options.ts` rather than `ask-presented.ts` / `composer-options.ts`, because the naming rule fails a third `ask-` or `composer-` file in a directory (moving existing files would have edited their tests).
3. An answer made with a PIN does not set `answerErrors`; the host's dialog is where a refused PIN is said.
4. `refreshControls` (thread change, a question appearing elsewhere, activation or stop) builds a new thread view, so attachments are read again then; only polls and re-reads keep the turn's view. A host-level cache across `refreshControls` was left out to keep `chat-widget.ts` small.
5. The project for an attachment read is `state.projectId ?? status.projectId`; with neither the attachment stays a reference.
6. An action with `reauthorize` and no `asks.reauthorize` is replaced by the elsewhere sentence; I read "no reauthorize" as per action, so a refusal still answers.

## Commands run and observed results

- `npx tsc --noEmit` (packages/ui-components) -> no output, exit 0.
- `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2` -> `Test Files 80 passed (80)`, `Tests 520 passed (520)`.
- `pnpm.cmd build` -> `{"build-cache":"build","step":"ui-components:build","reason":"inputs changed: packages/ui-components; stored in the shared store (509 file(s), 845322 bytes)","ms":40012,...}`, exit 0.
- `node scripts/structure-audit.mjs` (worktree root) -> `structure-audit: passed (485 warning(s), 1098 baselined).` Baseline untouched. The ui-components warnings are `chat-widget.ts` 633 lines (was 647), `chat.css` 677, `controller.ts` 586 (was 551), and the file counts in `view/` (25), `chat/tests/` (21), `conversation/tests/` (23).
- `node scripts/structure-audit.mjs --rule browser-imports` -> `structure-audit: passed (0 warning(s), 0 baselined).`
- The audit failed along the way on `failure-as-empty`, `swallowed-failure`, `naming`, `imports` and `statement-packing`; each was fixed in code (not baselined).

New tests (all pass): `conversation/tests/composer-options.test.ts` (maxLength, hint under the threshold, none without options, sendHint, keepDraft false writes no storage while the default does), `conversation/tests/answer-turn.test.ts` (turn and PIN on the answer, outcome, PIN not in `state()` or `answerErrors`, refused PIN, unanswerable ask, notice set by answer and send and cleared), `tests/asks-widget.test.ts` (presenter words, grant through reauthorize and PIN in the answer, wrong PIN, cancel, deny and text ask nothing, text kept on refusal, no-reauthorize fallback with `purpose: "ask"`, no port or null presentation unchanged, notice drawn and cleared, PIN not in the DOM, settled ask keeps the chat's sentence), `tests/attachments-widget.test.ts` (record is not a person bubble, no port leaves the bubble, turn meta, hidden kind, reading then drawn with the read's place, failed read, throwing drawer and unusable payload, unknown kind with Open, no open and no read, re-read does not reload, late read after a thread change dropped, `purpose: "model-key"`), `tests/pending-banner-widget.test.ts` (banner, absent without option, hidden without a waiting ask, cleared by answering, Show me moves the transcript's scroll and never the page). Shared fake: `tests/asks-core.ts`.

## Not verified

- No real browser: the new CSS (tones, textarea, banner, attachment line, hint), `getBoundingClientRect` scroll math in a real scroller, the visually hidden header with a screen reader, and `aria-live` on the stream nested over the live line's own `aria-live` were not looked at.
- The host's real PIN dialog and the extension/Studio adapters were not touched or run; the `submit` outcome contract is tested against fakes only.
- Late attachment reads after the fake document was removed produced noise only when a test did not wait; production behaviour of a read landing after a whole widget is torn down was not exercised.
- `aria-live` on the stream is unconditional (no test objected); not checked for double announcements with the live line.
- Real Core records: `CoreAsk.record` and the attachment shape were built from the port's types and old code, not read from a live Core.

## Open questions

- Should attachment views survive `refreshControls` (a cache owned by the widget)? Not needed for correctness; it saves re-reads on activation and on a question appearing elsewhere.
- `isHidden` here hides the attachment only; if the host means the whole turn is hidden, `message-view.ts` is the one place to change.
