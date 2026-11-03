# pkg-transport report (t846, chat stateful layer onto the ports)

## Outcome
Done, with one audit finding I cannot fix from my paths (web-vocabulary, below).

## What changed and why
Source (`packages/ui-components/src/chat/`), all `request(message)` use replaced by the ports, behaviour and comments kept:
- `conversation/thread-requests.ts` answers `ChatThreadListQuery` / `ChatSend`; `thread-tail.ts` takes `readThread`; `controller.ts` takes a `ChatConversationPort` (its try/catch for a throwing transport is kept as `safely`); `read/failure.ts` default branch reads `cause ?? detail ?? sentence`.
- `feed/activity-feed.ts`: deps are `{ activity: ChatActivityPort }`, `subscribe` delivers the state, `setOverlay` does nothing when the port has none; `runtime-listener` export removed.
- `onboarding/model-readiness.ts` takes `ChatModelsPort | undefined` (absent: `unknown`). `attachment/*` take `ChatRecordingsPort`; `CoreRecordingSummary` is `ChatRecordingSummary`.
- `controls/stop-control.ts`, `hold-control.ts` take a `ChatRunPort`; new `controls/index.ts` barrel (the audit's imports rule needs it). Recovery button shows only when `runs.openInstructions` exists.
- New `lease-transport.ts` (`leaseTransport`, `CONTEXT_CHANGED`); `owner-context.ts` is `createChatOwnerContext(transport, initialKey?)` with `ChatOwner.transport`; `project-navigation/draft-owner.ts` leases the same way.
- `chat-widget.ts`: `createChatWidget(transport, options)`, `ChatWidget`, `ChatWidgetOptions` (adds `openControl?`, `ownerKey?`). No `onExtract` -> `emptyStateModel(..., { extract: false })`. No `transport.recordings` -> no attachment passed to the composer (no "+" button), `attachLatestRecording` answers false. Run controls go through a delegating `ChatRunPort` that reads `owner.transport` at call time.
- `chat/index.ts` is the public barrel (everything old that moved, `createChatWidget` types, all of `ports/`, `createActivityFeed` + types, `createChatOwnerContext`, project-navigation names, `activityForTarget`, `threadRefreshWanted`, `createStopControl`, `createHoldControl`).
- Statement packing written out (composer.ts, and by a scripted pass over every owned file with packed lines; `.scratch` scripts removed).
- `ports/` unchanged.

Tests: new support `tests/message-transport.ts` (`messageTransport`, per-port `conversationOver/activityOver/runsOver/recordingsOver/modelsOver`, `TEST_MESSAGES`, `TEST_ACTIVITY_MESSAGES`), `tests/host-status.ts`, `conversation/tests/controller-over.ts`, new `tests/lease-transport.test.ts` (4), `conversation/read/tests/failure.test.ts` (3). `chat-panel.test.ts` renamed `chat-widget.test.ts`.

### Tests removed or materially changed
- No test removed. Counts (`test(` calls): conversation 91=91, feed 29=29, attachment 7=7, project-navigation 2=2, onboarding 4->5; old `chat/tests` 68 (incl. stop/hold/run-controls, now `controls/tests`) -> tests 59 + controls 18 = 77 (+9: lease 4, widget 4, hold 1; model-readiness +1, failure +3 elsewhere).
- `feed/tests/activity-feed.test.ts`: dropped the `fluxiq.statusChanged` push line (message-type filter, extension adapter's job); test renamed "...malformed states are ignored". Feed now built over `activityOver`.
- `tests/owner-context.test.ts` rewritten for `ownerKey`: the five-field loop (gateway/core/client/project/paired) and `ExtensionStatus` partials are the extension's key construction, so became: key change retires lease; volatile `connected/recording/projectId` keep it; A/B/A (via `transport`); initial-key vs first-status `{changed, initial}`.
- `conversation/tests/controller-project.test.ts`: no `relayConversation`. Fixture is now a fake `ChatConversationPort` (host project "old"); same scenarios and scope assertions. Changed: the relay's open-conversation + append-turn pair and its `capabilities` array are gone, so the "first Send" asserts one `send` for project "new" with no conversationId.
- `conversation/tests/target-switch.test.ts`: expected `threadListRequest/threadSendRequest` objects lose `type`/`kind` (they are queries now).
- `attachment/tests/attachable-recordings.test.ts`: fixture lost `title` (not in `ChatRecordingSummary`). `composer-attachment` likewise.
- `tests/chat-owner-recovery.test.ts`: no chrome stub or `createOpenFluxIQButton`; a small fake open control (`openingThrough`) sends `panelOpenFluxIQ` via the fake request; `status()` builds `hostStatus` with an `ownerKey` including the Core URL; the "missing settings / session / tab" status became `{connected:false}` and `{recording:true}` (same-owner volatile changes).
- `controls/tests/chat-run-controls.test.ts`, `chat-widget`, `live-run-display`, `build-request`, `project-panel`, `navigation-focus`: chrome listener stubs removed, `listen` goes through `messageTransport(request, { listen })`; `ExtensionStatus` -> `hostStatus`; node `mock.timers` -> `vi` fake timers; `as never` / `any` stubs typed. `chat-widget.test.ts`: the onboarding starts test mounts with `onExtract`.
- New: no-`onExtract` offers only Describe; no `recordings` port -> no attach button; no `models` port -> no key line, no `openControl` -> line without link; ask's Open FluxIQ absent; hold recovery button hidden without `openInstructions`; `readModelReadiness(undefined)` unknown.

## Commands run and observed results
- `npx vitest run src/chat/conversation src/chat/feed src/chat/attachment src/chat/onboarding src/chat/controls src/chat/project-navigation src/chat/tests` -> 37 files passed, 228 tests passed.
- `npx tsc --noEmit -p tsconfig.json` (whole package) -> no errors (0 lines).
- `node scripts/structure-audit.mjs`, my paths: statement-packing, as-never, imports, browser-imports all clear; only advisory warns remain (chat-widget.ts 647 lines, controller.ts 493, chat-widget.test.ts 493, conversation/tests 19 files).
- `grep -rnE "chrome\.|RUNTIME_MESSAGES|ExtensionStatus|PanelStore|node:" src --include=*.ts --exclude-dir=tests` -> nothing in my paths; only false hits `node: HTMLElement` params in other workers' view/stream files and testing/fake-dom.ts.

## Not verified
- Extension side (adapter, re-exports, shell tests) untouched and not run. `fluxiq/ui` resolved fine (no stale issue).
- Live browser behaviour not exercised.

## Open questions or contradictions found
- **FAIL `web-vocabulary` on ui-components** (all of it, not just mine: attachment/recording-attachment.ts, chat-widget.ts, controls/*, conversation/{ask-controls,composer,read/notice}.ts, plus dom/, icons/, testing/): the rule bans "aria", "class name", "scroll", "query selector" in Core packages. A DOM package cannot avoid them. This needs an audit-config decision in `scripts/structure-audit/config.mjs` (the supervisor is already editing it for `browser-imports`); I did not touch it or add a baseline.
- chat-widget.ts is 647 lines after writing statements out (was 549 packed); advisory only. Splitting is a later, reasoned job, not a logic-free split.
- Port design held; no `ports/` change was needed.
