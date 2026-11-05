# t871 ask fixes

Outcome: Done.

## What a person now sees
- A person-only check: the page card and panel header say "Waiting for you: finish the check on the page, then press Continue" (was "a question in the FluxIQ panel"). Chat shows the question with Continue / Stop, no card.
- A text question or permission: header "Waiting for you: a question in the FluxIQ panel"; chat shows the question only, no "Permission · Waiting for you" card.
- A cancelled wait now closes its question, so Continue / Stop do not stay under a turn nothing waits on.
- Allow answers a permission in one press; there is no PIN dialog.

## Changes
1. `pacer.ts` `waitingOn`: `activityActionOf(event)?.kind === "person_check" ? "check" : "answer"` (one line plus one import). The decision is the ask row's own title, not the label's words. Test: `activity-status/tests/pacer.test.ts` (one new test: check, open question, permission). `host-words.ts` words kept; header comment updated. `activity-relay.test.ts` pinned to the new behaviour.
2. New kind `question` (name "Question", icon `circle-dot`, the generic one, because `ui-components/icons/tests/lucide-icon.test.ts` pins the icon set). New file `activity-action/ask-names-permission.ts`: an ask row is a permission only when its title's ask-kind bracket says `permission` (or names no kind at all, as before); `action-of.ts` returns `question` otherwise (open, choice, confirm). The bracket is the only carrier the event has; `runtime/automation-activity/ask/title.ts` writes it from `ask.kind`. `without-ask-cards.ts` filters `question`; `retried.ts` one token (NOT_A_TRY, outside the strict list but the kind needed it). Tests: action-of, names, icons, `messages.test.ts` (question card, and no ask card survives `withoutAskCards`).
   Other readers of the kind: ui-components `card-words`, `action-card-view`, `step-message-view` index tables with a fallback to `other`; `apps/web` (read only) uses `ask.kind`, never `ActivityActionKind`; the on-page overlay and extension read `ACTIVITY_ACTION_*` by lookup only. Found nothing an added kind breaks.
3. `conversation-port.ts`: on abort the wait calls `host.expireAsk` (new helper `expiredOnCancel`), returns a answer that landed first (the race rule), and a rejected expire is dropped so the run still leaves the wait (`Promise.allSettled`, because the structure audit forbids a catch that returns empty). RED before the fix (`conversation-port.test.ts`, the old test pinned the opposite and was rewritten): `Tests 3 failed | 5 passed (8)`, "expected spy to be called 1 times, but got 0 times" and "expected undefined to match object { kind: 'grant' }". GREEN after: `Tests 21 passed (21)` over `src/runtime/automation-parking`.
4. PIN removed: deleted `panel/chat/asks/pin-dialog.ts` and `tests/pin-dialog.test.ts`; `pinDialog` option and `reauthorize` branch gone from `ask-port.ts`; `pinDialog` context flag gone from `present-ask.ts` (the shared-thread confirmation always says "This panel can't take your PIN." and goes to FluxIQ); `showPinDialog` export gone; the PIN scene and `pinEntry` removed from the asks spec; tests and comments updated. Kept: `takes-pin.ts` (the FluxIQ route uses it), the relay forwarding `authorizationPin` (harmless, left), Core `chat/ports/ask.ts`, and the `.ask-pin*` styles in Core `chat.css` (not mine; now unused by the extension).

## Commands and results
- `vitest run src/ui/activity-status src/ui/activity-action src/runtime/automation-parking` -> 38 files, 430 tests passed.
- `pnpm.cmd --filter fluxiq check` -> passed. `fluxiq build` then `ui-components build` -> exit 0 (an earlier build of mine was killed by my own timeout and was rerun to completion).
- ui-components `check` passed; vitest `src/chat/stream src/chat/view src/icons` -> 32 files, 198 passed.
- EXT `test-extension.mjs panel/chat/asks/ panel/chat/tests/ background/activity/` -> 70 tests, 70 pass.
- Structure audit: Core `passed (496 warning(s), 1097 baselined)` (after the allSettled change; the first form failed `failure-as-empty`); EXT `passed (237 warning(s), 552 baselined)`.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> passed.
- Asks spec, headed, auction-marketplace: 7 passed.

## Pictures (under `apps/extension/e2e/test-results/content/artifacts/`)
`...kept-in-the-transcript/person-check-page-and-panel.png`: page card "Waiting for you: finish the check..." plus the panel with the question, Continue and Stop, no card. `...Enter/text-question-typed.png`: the question and a box at 360 px, no card, nothing overflows. Not shot: keyboard order was exercised by the existing spec scenes (Allow, Don't allow, Continue, text box), unchanged.

## Not verified
Live browser with a real Core; the web app's display of a `question` kind (read only, it does not read the kind). The pacer detail for a check after the page's own report waits its turn (headline now equal), so Core's sentence shows after the detail interval, not at once; the relay test advances its clock for it.

## Needed from another lane
None. `pacer.ts` merge: my change is the import line and the `waitingOn` line only.
