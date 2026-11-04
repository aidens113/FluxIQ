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

- `threads`: a list of every thread with a picker, the unanswered count, the
  chat's name, and which thread to open on (needs `conversation.listAllThreads`).
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
extension API. `styles/tokens.css` sets the default theme on `:root`; a host with
its own design tokens may define the same names on an ancestor of the widget
instead. `@fluxiq/ui-components/testing` is the small DOM the tests build on.

## Clients

- **FluxIQ's panel** uses it as its only chat: the window over Automation Studio
  (`ChatDock`) and the chat alone at `/programs/automation-studio/chat?projectId=`,
  both through `apps/web/src/features/chat-widget`, a thin React host that supplies
  the transport, the PIN dialog, the attachment renderers and in-panel navigation.
- **The web extension** mounts it from its `panel/chat` adapter, which supplies
  the extension's transport and host bindings.

Chat rendering, stream models and styles change here and nowhere else. The
package depends on `fluxiq` (for `fluxiq/ui`) and nothing depends on it from
`fluxiq`. The structure audit's `browser-imports` rule walks its entries
(`src/index.ts`, `dom/index.ts`, `icons/index.ts`), so a Node built-in or an
unlisted third-party package fails the build.
