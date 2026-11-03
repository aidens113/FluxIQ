# pkg-threads: thread list, selection, change feed, background, history, welcome/fallback, chat window

Worker report. Worktree `C:/Users/osrs_/FluxStuff/fxwork/t852/!FluxIQ`, package `packages/ui-components`. Nothing committed.

## Outcome

Done. Everything is additive; with no new option passed the widget is as before, and every existing test passes unchanged (75 files, 484 tests, of which about 80 are new).

## What changed and why

- `kind: "thread"` target end to end: `same-thread.ts` (same by id), `stream/run-target.ts` (`threadKey`), `stream/target-activity.ts` (a thread is known by its id before it is read, shows what latest/project show, minus work speaking through another thread; this is the old chat's rule), `conversation/thread-requests.ts` (send names the thread's conversation and its own project). The package typechecks again.
- `conversation/controller.ts`: a thread target is read with `readThread` by id, never listed, and always re-read (no list gives its revision); `showEarlier()`; `state.earlierTurns` / `earlierCount`; a fourth argument `reach: ConversationReach { window?, withoutProject?, quiet? }`. `quiet` makes `refresh()` a no-op while the chat is in the background; `withoutProject` makes a project-less latest chat wait ("waiting": loading) or be empty without listing.
- `conversation/thread-tail.ts`: `window` (default `TURN_WINDOW`), `ALL_TURNS` (reads up to 100 pages of 50 from the start, so a long thread is still read in bounded pages), and `earlier` (count of turns above the first shown, tracked through the anchor).
- `conversation/thread-list/` (new directory, see Deviations): `summary.ts`, `parse.ts` (checking reader, bad records skipped, non-list = failed read), `order.ts`, `unanswered.ts`, `labels.ts`, `title.ts`, `options.ts`, `choose.ts` (which thread the latest chat gives way to), `catalog.ts` (reads `listAllThreads` 25 at a time, one read at a time, `forget()` drops a read on its way), `index.ts`.
- `threads/chat-threads.ts`: wiring of catalog + header + selection + host callbacks. `view/thread-header.ts` (picker labelled "Thread", else the title in words; hidden when the host takes the name and there is no picker; no Refresh), `view/earlier-turns.ts`, `view/hand-focus-on.ts` and `view/navigation-visible.ts` (moved out of chat-widget to keep it at 647 lines).
- `conversation/composer.ts`: `setUnavailable(reason)`; a `p.composer-unavailable` over the box, box disabled, placeholder "Chat unavailable".
- `chat-widget.ts` (still 647 lines): options `threads`, `welcome`, `fallback`, `history`; methods `setBackground`, `showEarlier`; change feed subscription (unsubscribed in `stopTimer`, so on stop and owner change); beat from `read-beat.ts`; owner change calls `threads.reset()`; with `threads` the latest chat is scoped to the host's `projectId`. `ChatWidget` and `ChatWidgetOptions` types moved to `chat/widget/{handle,options,index}.ts` and re-exported from `chat-widget.ts` (same import paths for everyone). The later worker adds its options in `widget/options.ts`.
- `lease-transport.ts`: leases `listAllThreads`, passes `changes` through like `activity.subscribe`.
- `view/empty-state-model.ts` / `empty-state.ts`: `offers.welcome`; model has `items`; drawn with lucide icons. `view/context-line.ts` hides for a thread target.
- `window/`: `createChatWindow`, `conversationLauncherLabel`. CSS appended to `chat.css` (existing tokens; `--chat-window-bottom` only with a fallback `var(--chat-window-bottom, 16px)`, so the token test is unaffected).
- Icons: `icons/chrome-nodes.ts` (`LUCIDE_CHROME_ICON_NODES`: messages-square, maximize-2, minimize-2, chevron-down, paperclip, triangle-alert, key-round, split, pen-line); `lucideIcon` looks in both tables; `LucideIconNode` tag union widened to polyline/line.
- Barrels: `chat/index.ts` exports `createChatWindow`, `ChatWindow`, `ChatWindowChat`, `ChatWindowOptions`, `conversationLauncherLabel`, and the thread-list helpers/types (`ChatThreadSummary`, `conversationDisplayTitle`, `conversationSubjectLabel`, `conversationSubjectFallbackLabel`, `sortThreadsForList`, `unansweredThreadCount`, `threadOptions`, `parseThreadList`, `ThreadOption`, `ThreadSubjectKind`).

## Exact new exports and signatures

- `createChatWindow(chat: ChatWindowChat, options?: ChatWindowOptions): ChatWindow`; `ChatWindowChat = Pick<ChatWidget, "element" | "setBackground">`; `ChatWindowOptions = { ariaLabel?: string; escapeBlocked?: () => boolean }`; `ChatWindow = { element; setWaiting(count: number); setTitle(title: string); open(); close(); isOpen(): boolean }`.
- `ChatWidget.setBackground(on: boolean): void`, `ChatWidget.showEarlier(): void`.
- `ChatWidgetOptions`: `threads?: ChatThreadsOptions`, `welcome?: ChatWelcome`, `fallback?: { title: string; line: string }`, `history?: { window: number }`.
- `createChatThreads(deps: ChatThreadsDeps): ChatThreads` (internal, `chat/threads`).
- `createThreadCatalog(deps: ThreadCatalogDeps): ThreadCatalog` with `ThreadCatalogDeps = { list(query: ChatThreadCatalogQuery); projectId(): string | undefined; changed(): void }`.
- `ConversationController.showEarlier(): Promise<void>`; `createConversationController(conversation, onChange, clock?, reach?: ConversationReach)`.
- `Composer.setUnavailable(reason: string | undefined): void`.
- `readThreadTail` target gains `window?`, `earlier?`; result gains `earlier: number | undefined`; `ALL_TURNS`.
- `readBeatMs(background: boolean, changes: boolean): number` (4 s, 10 s with changes, 5 s background).
- Ports unchanged (`ports/*.ts` and `target.ts` are as given).

## Behaviour decisions to know

- Selection: `initialConversationId` if listed, else the list's first thread, only while the target is `latest`. A thread, automation, question or project target is never replaced. Nothing is adopted while a send is in flight. `open({kind:"latest"})` adopts the first thread at once from the cached list. `onSelected` fires when a different thread comes on screen (by pick, restore or adoption). Owner change: target back to latest (scoped to host project), catalog dropped, the host hears count/title/selection afresh.
- A draft is not parked when moving between thread targets (a thread belongs to the person, not its project for the draft owner).
- Background: `quiet` stops the controller, the feed is stopped, the beat is 5 s regardless of tab visibility, change events read only the list. `setBackground(false)` starts feed and controller reads at once and follows the tail.
- "Show N earlier turns" shows only with `history`; without it the window is 20 and there is no control (as today).
- A welcome shows for an empty latest chat and an empty chosen thread; no model-key read is made while a welcome is set.

## Deviations from the brief

1. `conversation/thread-list.ts` is a directory `conversation/thread-list/`: with `thread-requests.ts` and `thread-tail.ts` a third `thread-` file fails the `naming` prefix rule, and no baseline entry was allowed. It also gives one exported thing per file.
2. The extra lucide nodes are in `icons/chrome-nodes.ts`, not `lucide-nodes.ts`: the existing icon test asserts that table holds exactly Core's pinned icons. A `lucide-` third file would fail the prefix rule too, hence the name.
3. `state.earlierTurns` is optional (`?: boolean`), because existing tests build `ConversationState` literals and must pass unchanged.
4. `ChatWidget`/`ChatWidgetOptions` moved to `chat/widget/` (see above) to hold `chat-widget.ts` at its size.

## Commands run and observed results

- `npx tsc --noEmit` (packages/ui-components) -> no output (clean). Before my change it failed in `stream/run-target.ts` and `stream/target-activity.ts`.
- `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2` -> `Test Files 75 passed (75)`, `Tests 484 passed (484)`.
- `pnpm.cmd build` -> `ui-components:build ... stored in the shared store (465 file(s))`, exit 0.
- `node scripts/structure-audit.mjs` (worktree root) -> `structure-audit: passed (485 warning(s), 1098 baselined).` Baseline untouched. New advisory warnings only: `chat/tests/` and `chat/conversation/tests/` file counts, `threads-widget.test.ts` 437 lines, `chat.css` 634 lines, `controller.ts` 551 lines (was 493, already past 400). `chat-widget.ts` is 647 lines, unchanged.
- `node scripts/structure-audit.mjs --rule browser-imports` -> `structure-audit: passed (0 warning(s), 0 baselined).`

New tests: `conversation/thread-list/tests/{thread-list,choose-and-catalog}.test.ts` (order, unanswered count, picker labels, selection rules, catalog), `chat/tests/threads-widget.test.ts` (opens waiting thread, restore, pick kept, owner change forgets, not stolen from automation/question, direct read and own-project send, project-less disabled composer lifting, loading before first read, change feed refresh/unsubscribe on stop and owner change, 4 s / 10 s beat, background reads only the list, history window and showEarlier, heading and onTitle, welcome, fallback, option ignored without the port), `chat/tests/thread-target.test.ts`, `chat/tests/lease-and-beat.test.ts`, `conversation/tests/{thread-target,composer-unavailable}.test.ts`, `view/tests/thread-header.test.ts`, `window/tests/chat-window.test.ts` (open/close, Esc, escapeBlocked, focus return, badge and label words, width toggle), `icons/tests/chrome-icons.test.ts`. Shared fake: `chat/tests/threads-core.ts`.

## Not verified

- No real browser: the window's CSS (fixed position, `--chat-window-bottom`, narrow-screen rule, picker look), real `<select>` behaviour, and real focus/Escape were exercised only under the fake DOM (focus is observed by stubbing `focus`).
- The thread-target live line uses the project's whole activity minus other-thread work; the old chat's exact filtering was read, not run against live Core.
- Interaction with the later worker's options (`asks`, `attachments`, `turnMeta`, `pendingBanner`, `composer`, `state.notice`) is untested; they should add options in `widget/options.ts`.
- A first message on a project-scoped latest chat opening a thread, then adoption switching to the `thread` target, resets the shown turns once (re-read); seen in logic only, not timed.
- No list-failure notice is drawn (a failed list read keeps the held list and retries on the next beat).

## Open questions

- Should an `unsupported` list read stop further list reads (currently it retries each beat)?
- `host.ts` has `projectName`; the old chat's "All projects" is drawn when neither a thread nor a project name exists.
