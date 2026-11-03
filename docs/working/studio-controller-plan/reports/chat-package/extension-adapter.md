# extension-adapter report (t846, extension consumes @fluxiq/ui-components)

## Outcome
Partial. Everything in the brief is built and its checks pass, except `pnpm --filter @fluxiq-web-extension/extension check`, which fails on two items for the supervisor (below).

## What changed and why
- `apps/extension/package.json`: link to `@fluxiq/ui-components`; `pnpm install --offline` done (lockfile +3 lines).
- New `panel/chat/transport/` (`createExtensionChatTransport(request, listen = listenToRuntime)`): `ports/{conversation,activity,runs,recordings,models}.ts`, `reply/{as-record,failure-of,payload-of,refusal-of,state-of}.ts`, barrels. Sends the exact old `RUNTIME_MESSAGES`/`ACTIVITY_MESSAGES` shapes. `cause` is set when the sentence is `EXTENSION_RESTARTED`; a nested `ok:false` from stop/takeOver/handBack is a failed result keeping `code`.
- `chat-panel.ts` is now a thin adapter over `createChatWidget` (signature, `ChatPanel`, `ChatPanelOptions`, `OpenFluxIQControl`, `OpenFluxIQFactory` unchanged). `host-status.ts` maps `ExtensionStatus` to `ChatHostStatus`; ownerKey is the extension owner context's identity (initial key passed as `options.ownerKey`); the open-FluxIQ factory is wrapped so controls observe the latest `ExtensionStatus`; imports `@fluxiq/ui-components/styles/chat.css`.
- `feed/` keeps `listenToRuntime` and an extension `createActivityFeed({ request, listen }, onChange)` (package feed over `activityPort`); `settings/` and `owner-context.ts` stay. `chat/index.ts` re-exports the old names from the package, so shell/settings/automations compile unedited (no edit outside owned paths).
- `dom/index.ts`, `icons/index.ts`, `chat/project-navigation/index.ts`, `chat/tests/fake-dom.ts` are re-exports; `theme/tokens.css` is one `@import`. Everything else that moved is deleted with its tests (chat attachment/conversation/format/onboarding/stream/view/controls, `chat.css`, `target.ts`, `same-thread.ts`, `icons/lucide-*`, `dom/create-element.ts`, icon test).
- Kept `conversation/tests/target-core.ts` (shell tests and e2e visual specs use it). Deleted `fake-core.ts`: only the deleted chat tests used it (the package has its own); the brief said keep, so say if it should come back. Kept a trimmed `chat/tests/activity-fixture.ts` (the settings model test uses `relayState`).
- Tests: `transport/tests/{ports-send,failures,subscribe}.test.ts` (+ `send-recorder.ts`), `chat/tests/chat-panel.test.ts` (integration through `targetCore`: mount, read thread, send, reply shown; plus owner change clears the chat), `panel/tests/css-tokens.test.ts` now also reads the package's `tokens.css` and `chat.css`.
- Core worktree list: `scripts/worktree/core-build.mjs` CORE_PACKAGES gains `@fluxiq/ui-components` after the websocket gateway (all other lists derive from it: freshness command, currency, lease, sync-core). Pinned tests updated: worktree/core-build, check/core-build/freshness, lab/core/build/{currency,unbuilt}, build-lease/{fixture,lease}, task/sync-core. `test-extension.mjs` comment only: the package is bundled (not external), confirmed by the panel tests running.
- `.structure-baseline.json` via `pnpm structure:baseline`: 30 removed, 1 lowered (a `packages/test-runner` count 6 to 4, re-sorted so it shows as one added line; unrelated to my files). No entries added.
- No Core source edits. I did rebuild Core's four libraries in the Core worktree (`pnpm --filter ... build`), because the extension's check refused a stale Core.

## Commands run and observed results
- `node scripts/test-extension.mjs panel/` (apps/extension) -> `# tests 584 # pass 584 # fail 0`. With `panel/ scripts/` -> 603 pass, 0 fail. `node scripts/smoke-test.mjs` -> "Extension smoke test passed."
- `pnpm --filter @fluxiq-web-extension/extension build` -> passes (tsc, then "chrome/firefox/e2e-chromium: verified 22 files").
- `pnpm --filter @fluxiq-web-extension/extension check` -> FAILS (exit 1), two causes:
  1. Browser-entry drift, Core's config (yours): "the extension bundle enters FluxIQ Core through `packages/ui-components/src/chat/chat.css` (imported by apps/extension/src/panel/chat/chat-panel.ts)" and "`packages/ui-components/src/theme/tokens.css` (imported by apps/extension/src/panel/theme/tokens.css), which Core's scripts/structure-audit/config.mjs browserBundles.entries does not list". Add those two paths to `browserBundles.entries` in Core. The JS entry (`src/chat/index.ts` or `dist`) was not named, so only the two CSS files drift.
  2. `tsconfig.test.json` errors only of the kind `Cannot find module '@fluxiq-web-extension/domain/node'` (and the TS7006 that follow) in e2e offline-reads and `packages/test-runner/src/offline-snapshot-page`: this worktree's `domain/dist` is not built (`--skip-workspace-build`), unrelated to the chat. I filtered the test-config output for any other error: none. `tsc -p tsconfig.json --noEmit` is clean.
- Outputs (dist/chrome, dist/firefox, dist/e2e-chromium, and build/): for sidepanel and popup, `index.js` contains `conversationInput` (3 matches each), `index.css` contains `.chat-panel` (34) and `--canvas` (5). No `.js` has a `node:` module specifier (`grep "node:[a-z]*"` of import/require forms -> 0 files); the bare text `node:` appears in 4 bundles only as an object key (`{ resultCode: void 0, node: void 0 }`).
- `grep -rln "chrome\." apps/extension/src/panel/chat --include=*.ts --exclude-dir=tests` -> `src/panel/chat/feed/runtime-listener.ts` only.
- `node scripts/structure-audit.mjs` -> "structure-audit: passed (231 warning(s), 553 baselined)" (after fixing one imports finding: transport imports `../feed` barrel). `git diff --stat .structure-baseline.json` -> 1 insertion, 31 deletions (the insertion is a lowered count, see above).
- Pinned script tests (freshness, currency, unbuilt, lease, sync-core, core-build) -> 39 pass, 0 fail.

## Not verified
- Live browser behaviour (side panel, popup, Firefox) and the e2e visual specs, which import `target-core` and `createChatPanel` (not run: no browser).
- The full `check` end to end (blocked by the two items above); `docs/architecture/repository-layout.md` and other docs not updated (not in my paths).
- Only `panel/` and `scripts/` extension tests ran; not the whole suite.

## Open questions or contradictions found
- Core's `browserBundles.entries` needs `packages/ui-components/src/chat/chat.css` and `.../theme/tokens.css` (or Core's rule must walk CSS imports).
- `fake-core.ts` deleted (see above).
