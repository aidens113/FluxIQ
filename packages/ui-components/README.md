# @fluxiq/ui-components

FluxIQ's chat UI as plain TypeScript DOM and CSS, with no UI framework. Every
client mounts the same widget, so the chat is updated here and nowhere else.

```ts
import { createChatWidget } from "@fluxiq/ui-components";
import "@fluxiq/ui-components/styles/tokens.css";
import "@fluxiq/ui-components/styles/chat.css";

const chat = createChatWidget(transport, { openControl });
container.append(chat.element);
chat.render({ connected: true, ownerKey: "me", projectId, recording: false });
chat.setActive(true);
```

The widget reaches the world only through the ports the client supplies
(`src/chat/ports/`): `ChatTransport` for FluxIQ's conversation, live activity,
run controls and optional recordings, model keys and change feed, and
`ChatWidgetOptions` for what only the host can do. Every option beyond the
transport is optional, and without it the widget does not offer that feature:

- `threads`: a conversation list of every thread, the unanswered count, the
  chat's name, and which thread to open on (needs `conversation.listAllThreads`).
  See "Conversation list" below.
- `asks`: a pending question in the host's words, and the PIN dialog before an
  answer with a lasting effect. The host draws the dialog; the PIN passes through
  to `conversation.answer` and is held nowhere.
- `attachments`: what a turn carries beside its words, drawn by the host's
  renderers, and the host's own records told apart from the person's words.
- The composer takes words at once. While a thread's first read is on its way a
  send is held, with a line saying so, and goes when the read lands; changing the
  words lets go of it, and a read that fails says so and keeps them.
- `welcome`, `fallback`, `history`, `turnMeta`, `pendingBanner` and `composer`: the
  words of the empty chat and its fallback, how many turns are kept, who said each
  turn and when, the banner over a question nobody answered, and the composer's
  limit, hint and whether a draft is kept in `localStorage`.

`createChatWindow(widget, options)` puts a mounted chat in a window with a launcher
that is always on screen, a badge when a question waits, and Escape to close. It
collapses without unmounting, so the count keeps reading (`setBackground`).

It imports no Node built-in and no browser
extension API. `styles/tokens.css` sets the brand theme on `:root`; a host with
its own design tokens may define the same names on an ancestor of the widget
instead (see Theme below). `@fluxiq/ui-components/testing` is the small DOM the tests build on.

## Conversation list

With `threads` set and `conversation.listAllThreads` present, the chat shows every
thread the person can see, the one waiting on them first, then the newest:

- a search box that keeps the chats whose name or time has every word typed
  ("invoice", "yesterday", "nov 3");
- one row per chat: its name (never an id), when it last moved ("3 h ago", "Oct 3",
  the full day on hover), "Waiting on you" when a question in it waits, and the
  chat on screen marked (`aria-current`);
- ArrowUp/ArrowDown between rows, Home/End, ArrowDown from the search box into the
  rows, Escape to clear the search and then to close the drawer;
- "Show older chats" while Core answered as many chats as were asked for (25 per page).

Three optional `ChatConversationPort` methods add controls; each control shows only
when its method is present, and each press reads the list again afterwards:

```ts
newThread?(request: { projectId?: string; subjectKind?: ChatSubjectKind; subjectId?: string; title?: string }):
  Promise<ChatResult<{ conversation?: unknown }>>;  // Core's open-conversation with fresh: true
renameThread?(request: { projectId?: string; conversationId: string; title: string }):
  Promise<ChatResult<{ conversation?: unknown }>>;
deleteThread?(request: { projectId?: string; conversationId: string }):
  Promise<ChatResult<{ deleted?: boolean }>>;
```

- **New chat** asks for a fresh thread about the host's open project
  (`subjectKind: "project"`), or about the panel (`subjectKind: "panel"`) with no
  project open, opens the conversation Core answers, and hands the caret to the composer.
- **Rename** edits the name in place: Enter saves, Escape or leaving the box cancels.
- **Delete** asks in place ("Delete this chat?" with Delete and Cancel), never through
  a browser dialog. Deleting the chat on screen opens the next one in the list, else
  the one before it, else the empty chat. A refusal, such as Core's
  `conversation_run_active` for a chat whose work still runs, shows Core's own
  sentence over the list.

`ChatThreadsOptions.layout` places the list:

- `"drawer"` (default), for a narrow host such as the extension's side panel or popup:
  a "Chats" button over the thread names the chat on screen and how many chats wait,
  and opens the list in the thread's place. Picking a chat, a new chat or Escape closes it.
- `"column"`, for a wide host: the list stands left of the thread and the line over the
  thread is the chat's name. The panel gets `data-thread-layout="column"` and the thread
  side sits in `.chat-body`.

Hook classes (the Lab and tests find elements by them): `chat-thread-header`,
`chat-thread-toggle`, `chat-thread-title`, `chat-thread-badge`, `chat-thread-nav`
(`data-layout`), `chat-thread-new`, `chat-thread-search`, `chat-thread-notice`,
`chat-thread-rows`, `chat-thread-row` (`data-conversation-id`, `data-selected`,
`data-waiting`, `data-mode`), `chat-thread-open`, `chat-thread-name`,
`chat-thread-when`, `chat-thread-waiting`, `chat-thread-rename`,
`chat-thread-rename-input`, `chat-thread-delete`, `chat-thread-confirm`,
`chat-thread-confirm-delete`, `chat-thread-confirm-cancel`, `chat-thread-none`,
`chat-thread-more`. The native picker (`chat-thread-picker`, `chat-thread-select`)
is gone. The list's styles are `src/chat/view/thread-list/thread-list.css`, which
`chat.css` imports, so a host still imports `styles/chat.css` alone.

`ChatThreadsOptions.unavailableReason` (optional) disables the composer, with that
sentence, for a latest chat with no project and no thread. Set it only when the
transport has nowhere to send a message that names no project (the web panel with
no project open). A host whose transport names the session's project for such a
message (the extension) leaves it out, so a new person can write a first message.

## Humanness

Humanness is a whole number from 0 (fastest) to 100: higher adds human-like timing,
click positions and the odd harmless misclick, for sites that limit robots. Robot
checks always pause for the person, at any level. A run uses the first of: its own
option, the task's, the Flow's, the person's starting value, then 0.

**The control.** `createHumannessControl(options)` is one reusable slider for a task,
Flow or FluxNode, exported from the package root for any screen. It holds no port: the
host gives it the level it read and a `commit`.

```ts
import { createHumannessControl } from "@fluxiq/ui-components";

const control = createHumannessControl({
  level: { own: 40, starting: 20 },            // `own` absent: it uses the starting value
  commit: (humanness) => port.setHumanness({ projectId, taskId, humanness }), // null clears
  label: "Humanness for this Flow",             // default "Humanness"
  onLevel: (saved) => { /* each level once saved, or put back after a refusal */ }
});
container.append(control.element);
control.show(levelReadAgain);                   // ignored while a change is on its way
control.dispose();                              // sends a level the keys left waiting
```

- A range 0-100 in steps of 5, its level in mono, the ends "Fastest" and "Most
  human-like", and one line on what it does. The spoken value says the level in words
  (`aria-valuetext` "40, more human-like").
- **Own level**: "Use starting value" sends `null`. **Inherited**: "Uses your starting
  value (N)"; moving the slider gives the task its own.
- No request per pixel: a drag is sent once on release; the arrow keys (and Page
  Up/Down, Home, End) step by 5 and send once they rest (`settleMs`, 500 by default)
  or when focus leaves. One request at a time; only the latest change made meanwhile goes.
- "Saving…", "Saved." and, on a refusal, "Not saved." with the host's sentence; the
  slider goes back to what was saved.
- **Draft mode** (`mode: "draft"`) is for a form that saves later, where a change is only
  a draft. The control never calls `commit` and never shows "Saving…", "Saved." or a
  refusal; it reports each settled level (drag release, arrow keys at rest, focus
  leaving, clear) through `onDraft(level | null)`, `null` meaning "use the starting
  value". The form saves it and then calls `show(level)`. Keyboard, `aria-valuetext` and
  the inherited/own display are unchanged. `canClear: false` hides "Use starting value"
  (the level is itself the starting value: pass `level: { own: v, starting: v }`);
  `inputId` names the range input; `explain` replaces the explanation line.

```ts
createHumannessControl({ mode: "draft", level: { own: 40, starting: 40 }, canClear: false, onDraft: (level) => form.markDirty(level) });
```

- Styles: `src/chat/controls/humanness/humanness.css`, which `chat.css` imports. A
  screen outside the chat imports that sheet after `tokens.css`.

**On the answer card.** With the optional `ChatTransport.taskSettings` port, each task's
answer card ends with a small "Humanness · N" button that opens onto the control. It
reads the card's task when the card first shows and again on each opening. Without the
port there is no control. A client that answers `unsupported` shows none; any other
failed read is said inside the fold.

```ts
type ChatTaskSettingsPort = {
  read(task: { projectId: string; taskId: string }): Promise<ChatResult<{ humanness?: number; starting: number }>>;
  setHumanness(request: { projectId: string; taskId: string; humanness: number | null }):
    Promise<ChatResult<{ humanness?: number }>>;  // humanness absent once cleared
};
```

Core's calls behind it are `list-project-tasks` (rows carry `humanness?`) and
`update-task-settings`. `starting` is the person's starting value, which the client
knows. Core refuses a level out of range with a named error; the client's adapter
answers it as a failed result whose `sentence` is the person's words.

## Theme

`styles/tokens.css` is the single token source: every stylesheet reads colours from
its custom properties and never from a literal. **Dark is the default**: `:root`
holds the dark brand values. `<html data-theme="light">` selects the derived
light theme, and `data-theme="system"` follows the OS through
`prefers-color-scheme`. The light values are written twice (once per selector)
and `src/theme/tests/tokens.test.ts` keeps the copies identical. `light-dark()` is
not used: it needs Chrome 123 and Safari 17.5, below the extension's Chrome 116
floor, and esbuild does not lower it.

Geist and Geist Mono ship in `src/theme/fonts/` and are declared in
`styles/fonts.css`, imported beside tokens.css. It is separate so a host that
cannot load font files still builds from tokens.css alone; `--font-sans` and
`--font-mono` then fall back to system fonts. The fonts are under the SIL Open
Font License 1.1 (`src/theme/fonts/OFL.txt`).

```ts
import "@fluxiq/ui-components/styles/tokens.css";
import "@fluxiq/ui-components/styles/fonts.css";
```

Tokens: surfaces `--canvas --surface --surface-raised --surface-muted --hover`;
rules `--divider --line --edge`; text `--text --text-soft --muted --text-dim`;
amber `--accent --accent-hover --accent-edge --accent-wash --accent-row
--accent-soft --accent-text --accent-ink` (`--accent-ink` is the text on an amber
fill); status `--success --warning(-soft/-text) --danger(-soft/-text)
--neutral-dot`; focus `--focus --focus-width --focus-offset`; type `--font-sans
--font-mono --chat-font --chat-mono --chat-size`; the chat's `--bubble --code-bg
--composer --composer-focus --send --send-text --send-off --send-off-text`;
`--shadow --shadow-sm --radius --space-1..4 --chat-column`.

Contrast (WCAG ratio, dark / light); every text pair is at least 4.5:1:

| Pair | Dark | Light |
| --- | --- | --- |
| text on canvas | 15.61 | 16.75 |
| text on surface | 15.05 | 18.24 |
| text-soft on surface | 12.56 | 11.15 |
| muted on canvas | 9.19 | 6.40 |
| muted on surface | 8.86 | 6.97 |
| muted on surface-raised | 8.47 | 5.96 |
| text-dim on surface | 5.43 | 5.62 |
| accent-text on surface | 10.54 | 7.82 |
| accent-text on accent-soft | 10.06 | 6.95 |
| accent-ink / send-text on amber | 10.93 | 10.93 |
| success on surface | 9.58 | 6.08 |
| warning on surface | 10.64 | 5.83 |
| warning-text on warning-soft | 10.15 | 7.56 |
| danger on surface | 6.39 | 5.96 |
| danger-text on danger-soft | 6.20 | 6.91 |
| send-off-text on send-off | 4.89 | 5.44 |
| text on bubble | 14.39 | 15.60 |
| text on code-bg | 15.81 | 15.60 |

## Clients

- **FluxIQ's panel** uses it as its only chat: the assistant dock (`ChatDock`) on
  every panel page. The chat-only route `/programs/automation-studio/chat` was
  deleted with the old Studio workspace. It mounts it through `apps/web/src/features/chat-widget`, a thin React host that supplies
  the transport, the PIN dialog, the attachment renderers and in-panel navigation.
- **The web extension** mounts it from its `panel/chat` adapter, which supplies
  the extension's transport and host bindings.

Chat rendering, stream models and styles change here and nowhere else. The
package depends on `fluxiq` (for `fluxiq/ui`) and nothing depends on it from
`fluxiq`. The structure audit's `browser-imports` rule walks its entries
(`src/index.ts`, `dom/index.ts`, `icons/index.ts`), so a Node built-in or an
unlisted third-party package fails the build.
