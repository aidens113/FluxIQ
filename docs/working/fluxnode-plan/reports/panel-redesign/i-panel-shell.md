# Brief P9-I: panel shell (navigation, top bar, page context, assistant dock)

## Outcome

Done, with three things the supervisor must know (deviations below). Unit tests, web typecheck and structure audit pass. The e2e spec is written, not run.

## What changed and why

New `apps/web/src/features/panel-shell/` (barrel in every directory):
- `context/`: `PanelContext` type, a pure reducer (`publish` replaces the page's picks and keeps the person's project; `project` drops picks; an unchanged state returns the same object), `onScreenFromContext` (page + selection, plus `flowId`/`runId` the chat already knows), the provider (with a `read()` so the dock's send reads the latest context without re-rendering), `usePanelContext`, and `PublishPanelPage` (pages render it to publish page and selection).
- `nav/`: the six items (Home, Flows, Runs, Data, Security, Settings) and `PanelRail`, one `nav` named "Main" with `aria-current="page"`.
- `top-bar/`: project switcher (`<select aria-label="Project">`, from the Studio `projects` endpoint), engine status (from `/api/ready`: 200 Running, 503 Not ready, anything else or a failed fetch "—"), spend ("Today: —").
- `dock/AssistantDock.tsx`: the assistant as a column on the right; on a phone a full-height sheet behind a round "Ask" button. Closing hides it without unmounting, so the thread and draft stay.
- `placeholder/PanelPlaceholderPage.tsx` and `panel-shell.css` (grid on wide screens; at 720px and under the rail becomes the bottom tab bar).

Panel branch of the transport (project behaviour unchanged):
- New `chat-widget/transport/panel-conversation-port.ts`: `list-panel-threads`, `get-panel-thread`, `send-panel-message` (page and selection from `onScreen()` on every send, over what the chat guessed; title only for a first message), `answer-panel-ask`. No project is named anywhere.
- Wiring: `options.panel?` in `transport/options.ts`, one ternary in `program-chat-transport.ts`, a `panel?` prop on `ProgramChatWidget` and `ChatDockProps`, a barrel export.

Routes: `apps/web/src/app/(panel)/layout.tsx` (signed out shows `LoginPanel`, as the old `/` did; signed in mounts the shell) and pages `/`, `/flows`, `/runs`, `/data`, `/security`, `/settings`, each a heading and one plain sentence. `apps/web/src/app/page.tsx` is deleted (the route now resolves to `(panel)/page.tsx`); `ProgramLauncher.tsx` is kept. `/programs/**`, `/setup`, `/welcome`, `/reset`, the login flow and `GlobalClientGatewayPairing` are untouched.

Tests: reducer and `onScreen` (8), nav (2), top-bar facts (3), panel transport branch (8), and `(panel)/tests/layout.test.tsx` (2, replaces the deleted `app/tests/HomePage.test.tsx`, which tested the old page). E2E spec `apps/web/e2e/panel-shell.spec.ts`: six items navigate with `aria-current`; the top bar facts are present; the dock opens on every page and says which page it is on; at 360px there is no sideways scroll on any page, dock shut or open.

## Deviations (decide or confirm)

1. **The dock mounts `ProgramChatWidget` (non-windowed), not `ChatDock`.** `ChatDock` is a floating window with a launcher (`position: fixed`), which cannot be a column "docked on the right", and the phone sheet and round button are this shell's own. It is the same widget and transport. I still added the `panel` prop to `ChatDock` so a floating variant works. Cost: no launcher badge for waiting questions (the window feeds it). If you want the badge, a later brief can read the unanswered count through `threads.onUnanswered` and show it on the round button.
2. **Today's spend shows "—" always.** No existing endpoint answers "spend today" (the only spend read is per Flow, `get-flow-spend`). `TopBar` takes `spendTodayUsd?`; nothing fills it yet. Needs an endpoint (Home brief or a Core one).
3. **Deleted `app/tests/HomePage.test.tsx`** (outside the listed paths) because it imported the removed page. Its "Get started" link and onboarding cards are gone from `/` until the wizard brief.

## Commands run and observed results

- `cd apps/web && npx vitest run src/features/panel-shell src/features/chat-widget "src/app/(panel)"` fails at startup: `apps/web tests: Core's library build is 237 minute(s) behind its source` (the stale-dist guard in `vitest.config.ts`). I did not rebuild Core libraries (other workers are in Core, and a rebuild deletes dist modules under them). I ran the same tests with a scratch config without the guard (`.../scratchpad/p9i-vitest.config.mjs`, same esbuild/exclude settings): `Test Files 1 failed | 19 passed (20)`, `Tests 123 passed (123)`. The one failing file is `chat-widget/tests/core-chat-transport.test.ts`: `Failed to load url @fluxiq/contracts/program-api-inputs`, a stale contracts dist missing a new export. It is not in my change and needs the rebuild. The new test files all pass.
- Web typecheck (under the heavy lock, 4.5 GB free): `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` -> exit 0, no output (after fixing two errors it found in my first version).
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (538 warning(s), 1095 baselined)`. It first failed my files on `as-never`, two components in one file, and shared filename prefixes; fixed by splitting and renaming.

## Not verified

- Playwright spec not run (no panel started, per the brief). Layout, the phone sheet, and "no sideways scroll" are by CSS reasoning only; the widget's own min-width inside the 360px dock is unchecked.
- No live browser behaviour: the dock against the real panel-assistant endpoints (F2's host binding may not be in place; without it the reply is "The assistant has no model on this panel yet").
- Whether the widget's thread-list reader shows panel threads: `parse.ts` in ui-components still lists only `project|flow|build|run` as subject kinds (found by brief M). Until that line gains `"panel"`, listed panel threads are dropped by the picker.
- `useProgramApi` calls `useSearchParams` (it reads `domainId`), so the shell needs a Suspense boundary if any page is statically prerendered; not hit because the layout is dynamic (`currentFluxIQUser` reads cookies).

## Open questions

- The widget's own subject on a send is "project" in `thread-requests.ts`; my branch ignores it and always uses the panel endpoints, so the dock can only talk panel threads. "Chat about this Flow" (project thread) will need a second widget or a mode switch.
- `ChatOnScreen` in `ConversationOnScreen` (`automation-studio/conversation`) lacks `page` and `selection`, but the panel branch uses `ChatOnScreen` from ui-components, so nothing there needed changing.
