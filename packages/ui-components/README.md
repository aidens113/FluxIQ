# @fluxiq/ui-components

FluxIQ's chat UI as plain TypeScript DOM and CSS, with no UI framework. Every
client mounts the same widget, so the chat is updated here and nowhere else.

```ts
import { createChatWidget } from "@fluxiq/ui-components";
import "@fluxiq/ui-components/styles/tokens.css";
import "@fluxiq/ui-components/styles/chat.css";

const chat = createChatWidget(transport, { openControl, onExtract });
container.append(chat.element);
chat.render({ connected: true, ownerKey: "me", projectId, recording: false });
chat.setActive(true);
```

The widget reaches the world only through the ports the client supplies
(`src/chat/ports/`): `ChatTransport` for FluxIQ's conversation, live activity,
run controls and optional recordings and model keys, and `ChatWidgetOptions`
for what only the host can do. It imports no Node built-in and no browser
extension API. `styles/tokens.css` sets the default theme on `:root`; a host with
its own design tokens may define the same names on an ancestor of the widget
instead. `@fluxiq/ui-components/testing` is the small DOM the tests build on.
