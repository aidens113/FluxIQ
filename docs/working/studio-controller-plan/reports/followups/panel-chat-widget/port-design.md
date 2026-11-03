# Panel chat widget (t852): port design and feature inventory

Sub-supervisor's design. The stable interface is `packages/ui-components/src/chat/ports/*.ts` (`ask.ts`, `attachment.ts`,
`threads.ts`, additions to `transport.ts` and `host.ts`) and `target.ts` (`kind: "thread"`). Read those first. Everything is
additive and optional: with none of it passed, the widget behaves exactly as today, and the extension's adapter does not change.

## Widget surface to add

`ChatWidgetOptions` gains, all optional:

| Option | Meaning |
| --- | --- |
| `threads: ChatThreadsOptions` | Thread list on (needs `conversation.listAllThreads`). See "Threads" |
| `asks: ChatAskPort` | The host's words for a pending question, and the PIN dialog |
| `attachments: ChatAttachmentPort` | What a turn carries; panel records told apart from the person |
| `welcome: ChatWelcome` | Replaces the empty latest chat's onboarding (`starts`, concept and "on this page" examples do not show) |
| `fallback: { title: string; line: string }` | Replaces "Talk to FluxIQ in the FluxIQ window." |
| `history: { window: number }` | Turns kept per thread instead of `TURN_WINDOW`; older ones behind one control. See "History" |
| `turnMeta: { formatTime(ms: number): string }` | Who said it and when: visually hidden header and hover title on each turn, hover title on step messages |
| `pendingBanner: boolean` | "FluxIQ stopped here and is waiting on your answer." with Show me, which scrolls to the ask |
| `composer: { maxLength?: number; remainingHintBelow?: number; keepDraft?: boolean; sendHint?: string }` | `keepDraft: false` keeps the draft in memory only (never `localStorage`) |

`ChatWidget` gains: `setBackground(on: boolean)` (only the thread list keeps reading, on a 5 s beat, whatever the tab's visibility;
off: read everything at once and follow the tail) and `showEarlier()`. `open` takes the new target.

New `createChatWindow(widget, options)` in `chat/window/` (name it so: `chat-dock` is taken by the composer's dock): launcher,
badge, window chrome. Plain DOM, exported from the barrel. See "Window".

## Threads (capabilities 3 and 4)

New `conversation/thread-list.ts`, no DOM, tested directly: `listAllThreads({ projectId, limit: 25 })` on each beat; each record read
by a checking reader into `{ conversationId, projectId, revision, status, updatedAt, pendingAskCount, title, subject: { kind } }`; a
record it cannot read is skipped, a list it cannot read is a failed read. Sort: waiting first, then open, then newest
(`sortConversationsForThreadList`). Unanswered: threads with `pendingAskCount > 0`. Labels and title move here as functions, words
kept exactly: `conversationSubjectLabel`, `conversationSubjectFallbackLabel`, `conversationDisplayTitle`, and the picker's labels
(`threadOptions`: `(waiting on you)`, and a date only where two labels repeat). All in
`apps/web/src/features/automation-studio/conversation/thread/naming.ts`, `model.ts` and `components/ConversationViewContent.tsx`.

Selection: `initialConversationId` when listed, else the first sorted thread, as a `{ kind: "thread" }` target; none: stays `latest`.
A first message on `latest` opens a thread as today and the next list read adopts it. Once the person picks, the pick stays. Never
retarget away from a thread the person picked, a `question` or an `automation` target. `onSelected` fires on each change, and an
owner change forgets the selection.

A `thread` target reads `readThread` directly by id (no `listThreads`), with its own project. `threadSendRequest`, `sameThread`,
`threadKey`, `activityForTarget` and `followedRunTarget` learn the new kind. `listThreads` is not called with no project when `threads`
is on and no thread exists; a project-less chat with no thread is `empty`, the composer is disabled and shows `unavailableReason`
above the box, and it starts working the moment a thread is listed.

View: `view/thread-header.ts`: a `<select>` labelled "Thread" (visually hidden) when more than one thread; otherwise, when `onTitle` is
absent, the title in words. `onTitle` hears `conversationDisplayTitle(selected, status.projectName)`. No Refresh control. The widget file
is 647 lines and the audit has no baseline entries for this package, so new wiring goes in its own modules.

## History

`readThreadTail` takes the window. `state.earlierTurns: boolean` is true while an anchor exists; the control "Show earlier turns" calls
`showEarlier()`, which reads from the start without a window. Words kept: `Show N earlier turn(s)` when the count is known. A long
thread is still read in bounded pages, as today.

## Asks and PIN (capability 1)

`CoreAsk` keeps Core's record as `record: unknown`; nothing else reads it. With `asks.present(record)` answering non-null on a pending ask,
`askControls` draws: title, description, consequences as a list labelled "Consequences requiring approval", note, then actions by `tone`
(hover from `description`), or a textarea (`textMax`, `textHint`, label "Your answer") with Send answer. An ask already settled keeps the
chat's own sentence. A null answer, or no port: today's controls exactly.

An action with `reauthorize`: pressing it does not answer. It calls `asks.reauthorize({ ...words, submit, cancel })`. `submit(pin)` calls
`controller.answer(askId, kind, value, { authorizationPin: pin })` and answers `{ ok: false, error }` on failure, so the dialog stays open and
says why. Without `asks.reauthorize` the action shows the "elsewhere" sentence and the open control (`purpose: "ask"`). The PIN is passed
through and held nowhere: not in state, not in `answerErrors`, not in a signature.

`controller.answer` becomes `answer(askId, kind, value?, extra?)`, resolving to `ChatResult<unknown>`-shaped outcome (existing callers ignore it).
It passes `turn: { conversationId, turnId, attachment }` on `ChatAnswer`. A `problem` string on an ok value, or on a send's ok value, sets a
new `state.notice`, drawn beside the read notice and cleared by the next send or answer or a target change.

## Attachments and panel records (capability 2)

`CoreTurn` gains `attachment?: ChatAttachment`, read with a checking reader; the signature in `thread-view.ts` includes it. `message-view.ts`
with the port: a record turn (`isRecord`) is on FluxIQ's side as a quiet line (`chat-record`), never the person's bubble, and with
`turnMeta` its author is "FluxIQ panel". `isHidden`: nothing shown. Otherwise new `view/attachment-view.ts`, matching
`ConversationAttachmentPanel`: a drawer and `read` => `Reading <label lowercase>...`, then the drawer's element; a failed read =>
`<label> could not be read here.`; otherwise `<label>, kept outside this conversation.`; each with a paperclip, the `ref` in `<code>`, and
Open when `open` exists. The element and its read belong to the turn: a re-read never reloads or redraws it. A thread change drops a late read.

## Change feed (capability 5)

`transport.changes.subscribe`: a change schedules the existing debounced refresh (300 ms), and the list read too. With the port present the
poll beat is 10 s instead of 4 s (`CONVERSATION_POLL_CEILING_MS`). The poll stays: this panel has no push channel, and a turn written by a
server-side run reaches it in no other way. Say so in comments, not "no polling". Subscribe in `startReads`/`setActive`, unsubscribe on
stop and on owner change. `lease-transport.ts` leaves it like `activity.subscribe`, and keeps `listAllThreads`, `changes` and `answer`'s fields.

## Window (capability 3)

`createChatWindow(widget, { ariaLabel?, escapeBlocked?: () => boolean })` answers `{ element, setWaiting(n), setTitle(t), open(), close(), isOpen() }`. Same
behaviour as `ConversationDock.tsx`, whose words are kept: launcher always on screen with label `conversationLauncherLabel` (move it), "Needs you"/"FluxIQ",
count badge, `data-waiting`, `aria-expanded`, `aria-controls`; collapsed by `hidden`, never unmounted, calling `widget.setBackground(true)`; open calls
`setBackground(false)` and focuses the window; Escape closes and returns focus to the launcher, unless `escapeBlocked()` (a modal over it); bar with mark, "FluxIQ", the
title, wider/narrower toggle, collapse toggle labelled for Esc; `role="dialog"`, `aria-label`, `tabindex="-1"`. Position: fixed, bottom from `--chat-window-bottom`.
Add missing lucide nodes (`messages-square`, `maximize-2`, `minimize-2`, `chevron-down` or as the old toggle drew, `paperclip`, `triangle-alert`). CSS in `chat.css` with existing tokens only: a new
custom property breaks `chat-widget-tokens.test.ts` unless mapped.

## Navigation (capability 6)

`ChatOpenControlFactory`'s `purpose` lets the panel draw a button that navigates in place. Only the panel changes.

## Feature inventory: every feature of the old UI

Check each off in the final report: where it now lives, and how it was verified.

| Id | Feature (old home) |
| --- | --- |
| D1 | Launcher always on screen, over the workspace and on the landing screen with no project (`ConversationDock`, `AutomationStudioSession`) |
| D2 | Badge count, "Needs you", launcher label naming how many threads wait |
| D3 | Collapsed, not unmounted; keeps reading so the badge can light |
| D4 | Escape closes and returns focus; not when a modal is over it; focus into the window on open |
| D5 | Wider/narrower toggle; bar with name and collapse toggle |
| D6 | Layout: bottom offset above the status bar and on narrow screens (`--automation-conversation-dock-bottom`, `04-layout.css`, `06-responsive.css`) |
| V1 | Thread picker: names, "(waiting on you)", date only where labels repeat, never an id |
| V2 | Heading: Core's title, project name, noun, "All projects"; handed to the shell's bar; no id |
| V3 | Failed read named, transcript left standing; one failure not shown |
| V4 | Opening message: "This is where FluxIQ talks to you", three arrivals |
| V5 | Loading state |
| V6 | Composer disabled only with no thread and no project, with the reason above it |
| V7 | Opens on the thread waiting on the person; sort order |
| V8 | A thread carries its own project: reads, sends, answers and activity use it; the list spans projects with no project open |
| V9 | `requestedConversationId` restore and `onSelectedConversationChange` |
| V10 | `onScreen` sent with every message (flow, run, recording) |
| V11 | No Refresh control |
| T1 | Follows its tail only at the bottom; "New turns below" control when behind |
| T2 | Bounded tail, 200 turns; "Show N earlier turns" |
| T3 | "FluxIQ stopped here and is waiting on your answer." with Show me |
| T4 | Tail found on opening a collapsed window |
| T5 | Step messages, action cards, outcome words; no tool id or node id |
| T6 | Live line in its own thread only; drops when settled |
| T7 | Survives a long build: history of steps kept |
| T8 | `aria-live` on the transcript; "Conversation transcript" label |
| U1 | Person's bubble; FluxIQ's formatted text (bold, code, lists, headings) |
| U2 | Panel record turns: "FluxIQ panel", quiet line, not the person |
| U3 | Author and time for a screen reader and on hover |
| U4 | Attachment resolved and drawn; reference, Open, "could not be read", unknown kind, hidden panel records |
| U5 | Flow graph diff: table, Added/Removed/Changed, strict parse, refusal text |
| U6 | Adaptation reference opens the Adaptations view; other references say there is no screen (`useConversationWorkspaceNavigation`) |
| A1 | Ask words per kind, consequences list, control note, button tones, option description on hover |
| A2 | Open ask: textarea with limit and hint, Send answer |
| A3 | PIN before a grant, a confirm with consequences, a destructive choice; none for deny or text |
| A4 | Wrong PIN keeps the dialog open with the error; Cancel sends nothing; the answer carries `authorizationPin` |
| A5 | After a grant on a `panel-capability` turn: runs exactly that invocation with the PIN; unreadable one says so and runs nothing; result turn recorded |
| A6 | Settled ask shows its outcome, not a second set of buttons |
| C1 | Enter sends, Shift+Enter new line, IME safe; empty sends nothing; arrow or spinner; hover says the keys |
| C2 | Grows by measurement; length limit; "N characters left" under 500 |
| C3 | Words kept when a send fails; newer typing not cleared by a finished send |
| C4 | No browser persistence of conversation content |
| C5 | First message on a project with no thread opens one |
| H1 | Instruction send: capability vocabulary, Core's execution, panel runs what Core did not, `problem` shown |
| H2 | `conversation.changed` committed after each write, heard from other surfaces; `runtime-run.changed` heard too |
| H3 | Keeps reading a project with no thread yet, so the first thread appears |
| H4 | Slow beat while hidden, read on becoming visible; no double read races |
| G1 | `GlobalConversationPrompt` keeps working: stands down in the Studio, its links lead to the new UI |
