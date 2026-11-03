# Panel chat widget (t852): web integration

Worker report. Worktree `C:/Users/osrs_/FluxStuff/fxwork/t852/!FluxIQ`, `apps/web`. Nothing committed.

## Outcome

Done, with the checks below run and observed. The Studio's window (landing and workspace) and the chat-alone route both mount
the package's `createChatWindow` / `createChatWidget` through one path (`ChatWidget.tsx`, fed by `ProgramChatWidget.tsx`). The
old React conversation UI, its hook, host seam, styles and tests are deleted. The package was not changed: no defect found.

## What changed and why

Built in `apps/web/src/features/chat-widget/`:

- `transport/`
  - `conversation-port.ts`: `listAllThreads` (`list-conversations` with `projectId` or `null`, no status filter); `listThreads` with no
    project answers an empty list; `send` merges the host's `onScreen()` over the chat's own, passes Core's `problem`, keeps the failed
    send's code (through `chatFailure`, so a 401 is still `refused`), and commits `conversation.changed`.
  - `answer-ask.ts` (new): `answer-ask` flat, with `authorizationPin` only when given. On a granted `panel-capability` turn it runs exactly
    `conversationPanelInvocation` through `runConversationCapability` with the PIN and the on-screen context; unreadable invocation: answers
    `{ ok: true, value: { problem: <the old sentence> } }` and runs nothing; commits `conversation.changed` after the answer.
  - `changes-port.ts` (new): `changes.subscribe` over `subscribeToAutomationStudioMutations` for `conversation.changed` and
    `runtime-run.changed`, scoped to the project getter (every project while none is open, since the list then spans them all).
  - `run-port.ts`: `commitRuntimeRunChanged` after Stop (by run, and for each run of a project-wide stop), Take over, Hand back. A build
    stopped by its Flow names no run, so it tells nobody.
  - `options.ts` gains `onScreen()`; `program-chat-transport.ts` adds `changes`.
- `activity/activity-port.ts`: with no project the read answers an idle state and asks nothing (was a `no_project` failure, which would
  have been a false failure on the landing screen).
- `asks/` (`present-ask.ts`, `panel-ask-port.ts`): parses Core's ask with the thread domain's reader (`parseConversationAsk`, now exported)
  and maps `conversationAskPresentation` / `conversationAuthorizationCopy` / `conversationAnswerRequest` to `ChatAskPresentation`.
- `attachments/`: `flow-graph-diff/` (plain-DOM drawer with the package's `createElement`, same words, same strict parse, same refusal),
  `labels.ts`, `read-attachment.ts` (`getConversationAttachment`), `panel-attachment-port.ts` (`isRecord` = `panel-capability-result`,
  `isHidden` = `panel-capability`, `open` only when the host has `onOpenAttachment`). Its CSS is in `chat-widget.css` (`.panel-diff-*`), on the
  mapped tokens.
- `navigation/panel-open-control.ts` replaces `studio-open-control.ts`: a button using the router push; `model-key` goes to
  `/programs/secret-keys`, `ask` (and the default) to `/programs/automation-studio?project=<id>`. No `target`, no new tab.
- `options/` (`panel-chat-options.ts`, `welcome.ts`): the one options builder both mounts use (`threads`, `asks`, `attachments`, `welcome`,
  `fallback`, `history: { window: 200 }`, `turnMeta`, `pendingBanner`, `composer`, `contextLine: false`).
- `ReauthorizeDialog.tsx`: the existing React `AuthorizationDialog`, PIN only; stays open with the error when the answer is refused;
  credentials cleared once the answer went; Cancel sends nothing.
- `ChatWidget.tsx`: one mount path. `windowed` puts the chat in `createChatWindow` (Escape blocked while `[data-overlay-root="modal"]` is
  open; `onTitle` and `onUnanswered` go to the window); `onTarget` lets the transport's project getter follow the thread on screen. It no
  longer retargets a picked thread to "latest" when there is no automation.
- `ProgramChatWidget.tsx`: transport, options, the PIN dialog state, the router. `ChatDock.tsx`: props of the old `ConversationDock`
  (`projectId` null allowed, `projectName`, `onScreen`, `onOpenAttachment`, `onSelectedConversationChange`, `requestedConversationId`).
  `ChatWidgetPage.tsx`: same `ProgramChatWidget`, no window, so the widget draws its own heading.
- `AutomationStudioSession.tsx`: both mounts are `ChatDock`. `--automation-conversation-dock-bottom` is now `--chat-window-bottom`
  in `workspace/04-layout.css` and `06-responsive.css`.

Domain edits (kept modules, minimal): `thread/contracts.ts` exports `parseConversationAsk`; `thread/panel-records.ts`
`conversationPanelInvocation` takes `Pick<ConversationTurn, "attachment">`; `instruction-commands.ts` returns the refused response as
`failure` so a send keeps its code; `conversation/index.ts` exports `getConversationAttachment`.

Deleted (confirmed by grep below): `conversation/components/**`, `conversation-host.ts`, `useConversationThread.ts`, `conversation/text/**`,
`styles/conversation/**` and its two `@import`s, `conversation/activity/{model,queries,stream,paced-status,useConversationActivity,
usePacedConversationActivity}.ts` and `activity/steps/**`, and from the thread domain what only the old UI used
(`visibleConversationTurns`, `conversationFollowsTail` and their constants, `latestConversationTurnId`, `mergeConversationTurns`,
`sortConversationsForThreadList`, `unansweredConversationCount`, `conversationDisplayTitle`, `conversationAttachmentIsPanelRecord`; the
package has its own of each). Kept: `capabilities/**`, `instruction-commands`, `turn-commands`, `turn-queries`, `thread/` (poller,
pending-asks, answers, contracts), activity `contracts`, `history`, `host-words`, `GlobalConversationPrompt` (untouched).

Tests that named old paths were updated: `studio-start-entry`, `CollapseToggle` (the dock is no longer a caller; the window's collapse is
the package's), `pane-responsive` (reads the package's `chat.css` for `--chat-window-bottom`), `architecture-contract`
(three entry views gone), `conversation-architecture` (rewritten against the new mount), `program-activity-port`, `program-chat-transport`
(no-project list is empty), `instruction-commands` (`failure`).

## Inventory

"pkg" = a test in `packages/ui-components` that already covers it. "dock" = `chat-widget/tests/ChatDock.test.tsx`.

| Id | Where it lives now | Proof |
| --- | --- | --- |
| D1 | package `createChatWindow`, mounted by `ChatDock` in both `AutomationStudioSession` mounts | dock "on the landing screen"; `conversation-architecture` "mounts over the whole workspace", "on the landing screen too"; pkg `window/tests/chat-window`; fixed position needs the browser |
| D2 | package window badge and `conversationLauncherLabel` | dock "lights the badge while collapsed"; pkg `chat-window` badge and words |
| D3 | window collapses by `hidden`; `setBackground(true)` keeps the thread list reading | dock "collapses without unmounting", "lights the badge while collapsed" |
| D4 | window Escape and focus; `escapeBlocked` in `ChatDock.tsx` | dock "closes on Escape and gives the key to a dialog over it"; pkg `chat-window` (focus return); real focus needs the browser |
| D5 | package window bar and width toggle | pkg `chat-window` width toggle; look needs the browser |
| D6 | `--chat-window-bottom` in `04-layout.css`, `06-responsive.css`; read by package `chat.css` | `pane-responsive` "the chat window keeps off the bottom-right chrome"; rendering needs the browser |
| V1 | package thread header and `threadOptions` | pkg `thread-list`, `thread-header`; real `<select>` needs the browser |
| V2 | package `conversationDisplayTitle`; `onTitle` to the window bar | dock "names the window by the thread, never an id"; pkg `thread-list` |
| V3 | package controller | pkg `controller`, `controller-recovery`; not re-proved here |
| V4 | `options/welcome.ts` | `panel-chat-options` "opens on the three arrivals"; dock "chat-alone route" shows the words |
| V5 | package loading state | pkg `threads-widget` (loading before first read) |
| V6 | `unavailableReason` in `panel-chat-options.ts`; package `setUnavailable` | dock "asks for no activity and shows no failure while there is no project"; `panel-chat-options`; pkg `composer-unavailable` |
| V7 | package selection and `sortThreadsForList` | pkg `threads-widget`, `thread-list`; dock "lights the badge" opens on the waiting thread |
| V8 | transport getter follows `widget.target().projectId` (`ProgramChatWidget`); every port takes the thread's project | dock "on the landing screen" (reads and activity in the thread's project); `answer-ask`, `conversation-port` tests; attachment read in dock "draws a proposed Flow change" |
| V9 | `ProgramChatWidget` `requestedConversationId` -> `initialConversationId`, `onSelected` | dock "names the window by the thread" (reports it), "reopens on the thread it was asked to" |
| V10 | `createConversationPort.send` merges `onScreen()` | dock "sends what the panel has open"; `conversation-port` "carries what the panel has open" |
| V11 | package thread header has no Refresh | pkg `thread-header` |
| T1 | package scroll follower | pkg `scroll-follow`; needs the browser for real scrolling |
| T2 | `history: { window: 200 }` | `panel-chat-options`; pkg `threads-widget` (history window, showEarlier) |
| T3 | `pendingBanner: true` | `panel-chat-options`; pkg `pending-banner-widget` |
| T4 | package `setBackground(false)` follows the tail | pkg `threads-widget`; dock tests open the window and read the thread |
| T5 | package step messages and cards | pkg `step-message-view`, `messages`, `action-card-view` (old web copies deleted; web kept `agent-attribution` "keeps the project notes internal" over `stepMessages`) |
| T6 | package target activity and live line | pkg `target-activity`, `live-run-display` |
| T7 | `holdConversationActivity` in the activity port; package step limit | `program-activity-port` "holds each unit of work whole"; pkg `stream-items` |
| T8 | package `aria-live` on the stream | pkg `thread-view`; screen reader needs the browser |
| U1 | package assistant text formatting | pkg `assistant-text`, `thread-view` |
| U2 | `isRecord` in the attachment port; package record line | `panel-attachment-port` "tells the panel's own records"; pkg `attachments-widget` |
| U3 | `turnMeta: { formatTime: formatRuntimeTimestamp }` | `panel-chat-options` "announces who spoke and when"; pkg `attachments-widget` turn meta |
| U4 | `attachments/` port, drawer, read | `panel-attachment-port` tests; dock "draws a proposed Flow change in place"; pkg `attachments-widget` (reading, failed read, unknown kind with Open) |
| U5 | `attachments/flow-graph-diff/` | `draw.test` (table, empty, refusal, strict parse) |
| U6 | `onOpenAttachment` = `conversationNavigation.openConversationAttachment` (unchanged), wired as the port's `open` | `panel-attachment-port` "offers Open only when the host can"; click-through to the Adaptations view needs the browser |
| A1 | `asks/present-ask.ts` | `present-ask.test` |
| A2 | `present-ask.ts` (`takesText`, `textMax` 8000) | `present-ask.test` "takes words for an open ask"; pkg `asks-widget` |
| A3 | `reauthorize` flag per action from `conversationAnswerNeedsReauthorization` | `present-ask.test` (PIN on grant, danger confirm, destructive option; none on deny/text/safe confirm) |
| A4 | `ReauthorizeDialog.tsx`; `answer-ask.ts` | dock "keeps the dialog open with Core's reason when the PIN is refused", "sends nothing ... when the person cancels"; `answer-ask.test` |
| A5 | `answer-ask.ts` | `answer-ask.test` ("runs a confirmed delete with the PIN, and exactly the invocation", "says so, and runs nothing, when the confirmation did not say what to run"); dock "runs a confirmed delete" |
| A6 | package settled ask | pkg `asks-widget` |
| C1 | package composer | pkg `composer-keys`; `sendHint` in `panel-chat-options` |
| C2 | `composer.maxLength` 8000, `remainingHintBelow` 500 | `panel-chat-options`; dock chat-alone route (`maxlength="8000"`); pkg `composer-options` |
| C3 | package composer | pkg `composer-draft` |
| C4 | `keepDraft: false`; no storage touched | `panel-chat-options`; `conversation-architecture` "keeps browser persistence out of every part"; pkg `composer-options` (no storage writes) |
| C5 | package first send opens a thread through `send` | dock "starts a thread on a project that has said nothing yet" |
| H1 | `conversation-port.send` through `sendConversationInstruction` | `conversation-port.test` (onScreen, `problem`, code, 401 -> `refused`); `instruction-commands.test` (unchanged semantics) |
| H2 | `changes-port.ts`; commits in `send`, `answer-ask`, `run-port` | `changes-port.test`, `conversation-port.test` ("tells the rest of the panel the thread moved"), `answer-ask.test`, `run-port.test`; dock "reads a thread another surface wrote to as soon as the panel hears of it" |
| H3 | package keeps listing with no thread | dock same test (a thread that appears is found while collapsed); pkg `threads-widget` |
| H4 | package 5 s background beat, 10 s with a change feed; activity port's hidden beat | pkg `lease-and-beat`; `program-activity-port` polling; `conversation-architecture` hidden-beat source check on the kept poller |
| G1 | `GlobalConversationPrompt` untouched; its links lead to `/programs/automation-studio`, where `ChatDock` is | `conversation-architecture` "mounts the prompt globally, and stands down"; `thread-model` prompt tests (kept) |

## Commands run and observed results

All in `apps/web` unless noted; every command run with the worker flags, no build, browser or provider.

- `npx tsc --noEmit` -> no output, exit 0 (run last after the final edit).
- `npx vitest run src/features/chat-widget src/features/automation-studio/conversation src/features/automation-studio/live src/features/automation-studio/styles src/features/automation-studio/shared src/features/automation-studio/tests src/app/tests --minWorkers 1 --maxWorkers 2`
  -> first run: `Test Files 1 failed | 71 passed (72)`, `Tests 1 failed | 562 passed (563)`. The one failure was
  `styles/tests/styles-architecture.test.ts` still expecting a `conversation` stylesheet domain; I removed it from the expected set.
  After that, `vitest run src/features/automation-studio/styles` -> `Test Files 3 passed (3)`, `Tests 13 passed (13)`. I did not re-run the
  whole seven-folder command a second time; I re-ran the folders I changed afterwards: `vitest run src/features/chat-widget
  src/features/automation-studio/conversation/tests` -> `Test Files 18 passed (18)`, `Tests 134 passed (134)` (the final state of
  `ChatDock.test.tsx`), and earlier `vitest run src/features/automation-studio/conversation` -> `Test Files 16 passed (16)`,
  `Tests 165 passed (165)`.
- Grep for deleted paths and classes:
  `grep -rlE "ConversationDock|ConversationView|useConversationThread|automation-conversation-" apps packages/ui-components/src --include=*.ts --include=*.tsx --include=*.css --include=*.mjs`
  -> no file (the one architecture test that asserts their absence uses a regex without the trailing dash). A wider grep also for
  `conversation-host`, `useConversationCommands`, `studio-open-control`, `studioOpenControl`, `ConversationComposer`,
  `ConversationAskForm` found only that test file before its wording was changed.
- `node scripts/structure-audit.mjs` (root) -> `structure-audit: passed (484 warning(s), 1098 baselined).` Baseline untouched. Along the
  way it failed twice and both were fixed in code: an `imports` finding (`read-attachment.ts` reached into `transport/chat-result`; now
  through the `transport` barrel, which exports `chatResult`) and a `statement-packing` finding in my dock test. No new warning is from a file
  of mine; `ChatDock.test.tsx` is 398 lines (a first draft was 445, trimmed).

## Not verified

- No browser: the window's fixed position and `--chat-window-bottom` look, narrow-screen layout, real `<select>`, real focus and
  Escape, scrolling and "New turns below", the visually hidden turn header, and the click-through from Open to the Adaptations view.
- `ChatWidgetPage` has no project name, so its heading falls back to the thread's title or "All projects" until a thread is listed.
- Core's real `answer-ask` refusal of a wrong PIN: tested with a fake that answers `requiresRecheck`, not against Core's handler.
- `requestedConversationId` is read when the chat is made; a later change of it does not reopen another thread (no caller changes it).

## Open questions or contradictions found

- The widget must be given no `ownerKey` up front for the thread list: with the old key given, the first status was "not a change of
  owner", so the latest chat was never scoped to the host's project and a project with no thread had a disabled composer. The mount now
  omits it (the first status makes the first owner). This is the host's side of the package's contract, not a package defect, but the
  `ownerKey` option's comment in `widget/options.ts` could say so.
- The package's icon tables have no `plus` or `minus`, so the diff's Added and Removed rows are told by word and a coloured label
  (`data-change`) rather than the old icons. Adding the two icons to `icons/chrome-nodes.ts` would restore them; not done (the web tests refuse a
  stale `dist` and the brief limited package edits to defects).
- `.structure-baseline.json` still lists entries for deleted files; the audit tolerates them. `pnpm structure:baseline` would drop them
  (not run: it rewrites a root file I do not own).
- `docs/architecture` has no mention of the old dock; `docs/working/.../chat-package/web-client.md` and `hosted-production-plan/reports/h0-s6.md`
  still name `ConversationDock` as history.
- A build stopped through its Flow sends no `runtime-run.changed` (the mutation needs a run id).
