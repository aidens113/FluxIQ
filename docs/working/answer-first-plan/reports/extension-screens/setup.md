# t871 SETUP report

Outcome: Done, with one deliberate deviation (the key is a card above a usable chat, not a gate).

## What a person now sees
1. Not connected: one screen, five steps in order: Start FluxIQ (says "run pnpm dev in the !FluxIQWebExtension folder, leave that window open"), Sign in (first time admin/admin, then pick a password; Open FluxIQ button), Connect this browser (Connect), Approve (code, Open FluxIQ, Cancel), Add a model key (To do, "you add it once you are signed in"). Nothing ticked unless detected (a stored approval ticks Sign in and Approve). "Three steps" is gone.
2. Waiting for approval: Start and Connect ticked, code shown, Sign in "needed to approve, use Open FluxIQ below".
3. Failed connection: step 1 "FluxIQ isn't answering. Check pnpm dev is still running", Try again, "Check the connection address" link (the ws:// address stays behind Settings; a test asserts no address in any step's words).
4. Connected: chat returns. Key missing: a card above the chat ("FluxIQ is running, and this browser is connected and approved", "Add a model key", Open FluxIQ to the keys page, Not now). Locked: same card, "Unlock this browser once" (key ticked in the model). Ready: card gone by itself (re-read every 4 s while missing/locked, and on panel focus or visibility). Unknown or failed read: nothing shown. Firefox popup: a fresh popup re-reads on connect, so it lands on the same step.

## Lab safety decision (item 3)
I did NOT gate the chat on the key. The Lab connects, then adds its key just before typing. `chat-build/creation/readiness.ts` fails at once (no retry) unless the chat scope is ready with the composer enabled, and Firefox `panel-driver.pagePanelDriver.send` waits for the composer to be visible; a hidden chat could fail both, and a Lab key that reads locked would never clear. So the card leaves `#conversationInput` reachable. To avoid telling the key twice, `getting-started.css` hides the chat's `.chat-key-line` while the card shows, and hides the card unless the chat's empty state is on screen (a chat holding work is never nagged). "Not now" is remembered for the panel session, then the chat's own line (t865) carries the reminder. Consequence: no "Go to the chat" button (the chat is already there).

## Files (EXT apps/extension)
New `src/panel/getting-started/`: `setup-port.ts`, `extension-setup-port.ts`, `setup-card.ts`, `model/key/{reading,from-reply,reader}.ts` (+barrels), `start/{steps,step-words,view}.ts` (moved from start-*.ts; audit forbids shared prefixes), CSS appended. Edited: `shell/contracts.ts` (`PanelPorts.setup?`), `shell/mount-panel.ts` (removed `void ports`, reader, card, focus/visibility refresh). Tests: `start/tests/{steps,steps-lost,view}.test.ts`, `model/key/tests/{from-reply,reader}.test.ts`, `tests/extension-setup-port.test.ts`. Spec: `e2e/content/tests/screens/tests/setup-company-website.spec.ts`. screen-state.ts and open-fluxiq unchanged (button already supports `purpose: "model-key"`).
`readModelKey` follows t865's rules (enabled keys; all `unlocked === false` is locked; no field is ready; no list is unknown) from the background message, whose relay on t865's branch passes `unlocked`/`lockedBecause`. I read only "locked" (no reason); the reason words live in t865's chat line.

## Commands and results
- `EXTENSION_TEST_BUILD_LABEL=t871 node scripts/test-extension.mjs panel/getting-started/ panel/shell/ panel/open-fluxiq/` -> tests 100, pass 100, fail 0.
- `pnpm.cmd run test:content e2e/content/tests/screens/tests/setup-company-website.spec.ts --headed --workers=1` -> 3 passed.
- `node scripts/structure-audit.mjs` -> no FAIL in my paths. Remaining FAILs are not mine: `screens/scripted-panel.ts` (as-never, packing), `chat/tests/chat-panel.test.ts`, `chat/asks/*`, `screens/tests/asks-auction-marketplace.spec.ts`.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> FAILED only with TS2307 `@fluxiq-web-extension/domain/node` and TS7006 in offline-reads specs and test-runner (domain dist not built in this worktree, files not mine). `tsc --noEmit` filtered for anything else printed nothing.

## Pictures (apps/extension/e2e/test-results/content/artifacts/screens-tests-setup-compan-*/), all read at 360 px
1-disconnected, 2-waiting-for-approval, 3-failed-connection, 4-connected-key-missing, 5-connected-key-locked, 6-connected-key-ready, keyboard-1..3, popup-reopened. No overflow, no ws:// address, no unexplained button. I fixed one thing seen: two Open FluxIQ buttons beside the code; the sign-in one now hides while the code shows. Keyboard: Tab from the Chat tab reaches sign-in Open FluxIQ then Connect (visible focus ring), Enter connects; in the card Enter on Open FluxIQ sends purpose model-key, Tab then Enter on Not now hides it and the chat's line appears once.

## Not verified
No live Chrome/Firefox with the real extension; Firefox popup close-and-reopen is simulated by remounting. Locked case drawn only through a scripted port: this branch's chat does not know "locked", so t865's chat line was not seen beside it. The Lab was not run.

## Needs from others
- Start FluxIQ has no installer: docs/user/quickstart.md says `pnpm dev` in !FluxIQWebExtension, and it also still describes the old "sign out and in" unlock, which t865 changed.
- Someone owning scripted-panel.ts must fix its audit failures.
