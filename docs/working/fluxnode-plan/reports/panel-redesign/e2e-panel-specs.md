# P9-E2E: the panel's Playwright specs pass

## Outcome
Done. The seven specs (`panel-{shell,home,runs,settings,flows,assistant,redirects}`) pass on desktop-chromium in one run after a fresh seed: `43 passed (2.7m)`.

## What changed and why (cause first)
Product fixes
- `src/features/chat-widget/ProgramChatWidget.tsx`: the `panel` prop was never handed to the transport, so the dock talked to the project conversation endpoints (old "instructions" reply: "I read your message without the model...") instead of the panel assistant's. Now passed (read through `latest`, fixed when the chat is made). This is why the scripted assistant never answered.
- `src/features/panel-shell/dock/AssistantDock.tsx`: the dock always passed `projectId={null}`, so the chat said "Chat unavailable / Open a project to start a conversation" even with a project chosen in the top bar. It now follows `context.projectId`.
- `src/features/chat-widget/asks/present-ask.ts` (+ test): a confirmation that names its own answers (options `grant`/`deny`, as the assistant's card does) now shows them ("Allow" / "Don't") instead of the Studio's "Confirm" / "Cancel".
- `src/features/runs/list/RunsFilters.tsx`: the three filter selects had names only through their wrapping label, whose text also holds every option, so the name was "FlowAll Flows...". Each select now has `aria-label` "Flow", "Client", "Result".

Spec and fixture fixes
- Redirect spec signed in with `authenticate` (waits for the retired "Programs" heading); now `signInToPanel`.
- Flows rename: the seeded editable Flow has never run, so the status line correctly says "Not run yet" ("Changed, not yet run whole" needs an earlier run; unit-tested in `status.test.ts`). The spec now asserts the save banner's "It has not run whole since."
- Runs "does not exist": two links matched "All runs" ("All runs" and "See all runs"); now `exact: true`.
- Assistant spec read Flow names with `page.request`, which does not send the `Secure` session cookie to plain http; it now fetches from inside the page.
- Seed (`e2e/support/seed-fixtures.mjs`, `app-fixture.ts`): the fixture person had a PIN, and a PIN-on person's assistant delete is refused ("PIN is required for this action", F1 open question 4). The product asks for no PIN on normal actions, no spec used the PIN, so the seed sets none and the manifest no longer carries `securityPin`.

The four `goto` timeouts and the shell "Data stayed on /runs" were `next dev` compiling each route on first visit: fixed by running the specs against a production build (`pnpm --filter @fluxiq/web build`, then `next start --hostname 127.0.0.1 --port 3187`, same environment). No timeout was changed. (Pages answer in 35-80 ms warm; only the first login is slow, 8.6 s cold, inside its 30 s allowance.)

Two Home/shell flakes seen mid-way (a click that did not navigate) disappeared once the assistant spec stopped failing and leaving a pending card; I did not find a separate cause and they did not recur in the final run or in four repeats of the Home test.

## Commands run and observed
- Memory 5464 MB before build; lock taken and released.
- `pnpm --filter @fluxiq/web build` -> succeeded (about 4-6 min each, run three times).
- Seed (`FLUXIQ_E2E_FAST_STUDIO=true node e2e/support/seed-fixtures.mjs`), `next start` on 3187 with key variables unset, `FLUXIQ_E2E_SCRIPTED_ASSISTANT=1`; `npx playwright test e2e/panel-{...}.spec.ts --project=desktop-chromium --workers=1` -> `43 passed (2.7m)`.
- `npx vitest run src/features/{chat-widget,runs,panel-shell,home,flows} "src/app/(panel)"` -> 31 files, 209 tests passed.
- `cd apps/web && node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` -> exit 0.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (522 warning(s), 969 baselined)`.
- Server stopped by port owner, lock removed.

## Not verified
- `verify-fixtures.mjs` after the PIN removal was not run; nothing in it references the PIN (grep).
- No test of `ProgramChatWidget`'s `panel` wiring beyond the browser spec.
- Phone project (mobile) not run; only desktop-chromium was asked for.
- e2e/README still shows `pnpm dev` for the server; recommend adding "or a production build (`next start`)" since dev compiles per route (README not in my owned paths).

## Open questions
- Switching the top-bar project makes the dock a new chat owner (it forgets the thread). If the panel thread should survive a project change, Core's "nowhere" rule (`chat-threads.ts`, needs a project to send) would need to allow panel threads with no project; that is `packages/**`, not changed.
