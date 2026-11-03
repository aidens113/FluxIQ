# Chat package: port design (t846)

Supervisor's design for moving the extension chat into `packages/ui-components`.
Workers read this instead of rediscovering it. The stable interface is
`packages/ui-components/src/chat/ports/*.ts`; read those files first.

## Layout

```text
packages/ui-components/src/
  index.ts            barrel: chat, dom, icons
  dom/                createElement (the panel's one DOM builder, moved)
  icons/              lucideIcon, LUCIDE_ICON_NODES (moved; chat views draw with them)
  theme/tokens.css    design tokens on :root (moved)
  testing/            fake-dom.ts, exported as @fluxiq/ui-components/testing
  chat/
    index.ts  chat-widget.ts (was chat-panel.ts)  chat.css  target.ts  same-thread.ts  owner-context.ts
    ports/  controls/ (stop, hold)  attachment/  conversation/  feed/  format/  onboarding/  project-navigation/  stream/  view/
```

The package's JS imports no CSS. Clients import `@fluxiq/ui-components/styles/chat.css`
and `/styles/tokens.css` (exports point at `src/`, shipped as they are). Relative imports use
explicit `.ts` and `/index.ts` (tsconfig.build is NodeNext with `rewriteRelativeImportExtensions`).
Tests use vitest (`from "vitest"`; `node:assert` stays as it was).

The first mechanical pass is done: every moving file is already copied with imports rewritten.
What remains in each file is the imports listed as unresolved (`shared/constants`,
`shared/protocol`, `../state`, `copy`, ...) and what they imply.

## What stays in the extension

`panel/chat/feed/runtime-listener.ts` (chrome), `panel/chat/settings/**` (the page overlay preference is
extension-only), the extension's `owner-context.ts` (reads `ExtensionStatus`; `mount-panel.ts` uses it with
`store.request`), and a new `panel/chat/transport/` adapter. `createChatPanel(request, openFluxIQ, options)`
keeps its signature, so `panel/shell/**` and `panel/settings/**` need no edit.
`panel/chat/index.ts`, `panel/dom/index.ts`, `panel/icons/index.ts`, `panel/chat/project-navigation/index.ts` and
`panel/chat/tests/fake-dom.ts` become re-exports of the package. `panel/theme/tokens.css` becomes one `@import`.
`conversation/tests/target-core.ts` and `fake-core.ts` stay for shell tests and e2e visual specs.

## Ports, mapped from the old `request(message)`

| Old message | Port | Notes |
| --- | --- | --- |
| `panelConversationRead` kind `list` | `conversation.listThreads` | old `value.payload.conversations` becomes `value.conversations` |
| `panelConversationRead` kind `get` | `conversation.readThread` | old `value.payload.conversation` becomes `value.conversation` |
| `panelConversationSend` | `conversation.send` | same flattening; the send's `onScreen`, subject and title stay in `thread-requests.ts` |
| `panelConversationAnswer` | `conversation.answer` | |
| `ACTIVITY_MESSAGES.read` | `activity.read` | `value.state` |
| `ACTIVITY_MESSAGES.changed` push | `activity.subscribe` | the listener gets the state; the extension adapter filters the message type |
| `ACTIVITY_MESSAGES.setOverlay` | `activity.setOverlay?` | optional; absent, `feed.setOverlay` does nothing |
| `panelStopRun` | `runs.stop` | old nested `value.ok === false` is a failed result; `value.cancellationRequested` is flattened |
| `panelTakeOverRun` / `panelHandBackRun` | `runs.takeOver` / `runs.handBack` | old nested `value.ok === false` is a failed result; `code` still carries `automation.instructions_required` |
| `panelOpenFluxIQ` with `runId` (hold recovery) | `runs.openInstructions?` | absent: the recovery button never shows |
| `listRecordings` | `recordings?.list` | `value.items` (was `value.recordings.items`); absent: no attach button, `attachLatestRecording` answers false |
| `panelModelReadiness` | `models?.readKeys` | `value.keys` (was `value.payload.keys`); absent: readiness stays `unknown` |

`PanelResult` becomes `ChatResult`, plus `cause`: `read/failure.ts` no longer imports the extension's copy; its
default branch reads `failure.cause ?? detail ?? sentence`. The extension adapter sets
`cause: "the extension's background didn't answer"` when `sentence === EXTENSION_RESTARTED`.

## Widget API

`createChatWidget(transport: ChatTransport, options?: ChatWidgetOptions): ChatWidget`. `ChatWidget` is the old
`ChatPanel` with `render(status: ChatHostStatus)`. `ChatWidgetOptions` is the old `ChatPanelOptions`
(`onConversation`, `contextLine`, `onExtract`) plus `openControl?: ChatOpenControlFactory` (the old
`OpenFluxIQFactory`; absent: no key-line link and an ask's Open FluxIQ is an empty span) and `ownerKey?: string`
(the initial owner key, so a first status with the same key is not a change of owner). `ChatWidget.render` maps:
`connected` was `connectionState === "connected"`, `recording` was `recordingState` being `recording` or `paused`,
`ownerKey` replaces the five fields the old owner context compared.

Without `onExtract`, the empty state does not offer "Extract data from this page"
(`emptyStateModel` takes `{ extract: boolean }`, default true).

`owner-context.ts`: `createChatOwnerContext(transport, initialKey?)`; `ChatOwner` has `token`, `identity`, `current()`
and `transport`, a leased copy (`lease-transport.ts`): when the owner is no longer current every request answers
`{ ok: false, sentence: "This chat context has changed. Try again." }`. `project-navigation/draft-owner.ts` leases
the same way. `activity.subscribe` is not leased: `feed` already guards its lifecycle.

## Tests

The old tests fake `request(message)` with `RUNTIME_MESSAGES`. To keep their assertions intact, package tests
use `chat/tests/message-transport.ts`: `messageTransport(request)` answers a `ChatTransport` that sends the old message
shapes to a fake `request`, with names from a local `TEST_MESSAGES` (same property names as `RUNTIME_MESSAGES`), and
applies the flattening above. So most test diffs are their imports. `chat/tests/host-status.ts` builds a `ChatHostStatus`.

The extension keeps new adapter tests beside `panel/chat/transport/`, asserting each port call sends the right
`RUNTIME_MESSAGES` shape and flattens the reply, plus one integration test of `createChatPanel` through `targetCore`.

## Audit

Core's audit has no baseline entries for the new package, so ratcheted findings are real failures:
`statement-packing` (one statement per line; the extension's baseline holds counts for 27 chat files) and `as-never`
(4 test files). Fix them by writing the code out and by typing the tests properly. Never add a baseline entry, never
relax a budget. Check with `node scripts/structure-audit.mjs` in the Core worktree.
