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
extension API. `styles/tokens.css` sets the brand theme on `:root`; a host with
its own design tokens may define the same names on an ancestor of the widget
instead (see Theme below). `@fluxiq/ui-components/testing` is the small DOM the tests build on.

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
