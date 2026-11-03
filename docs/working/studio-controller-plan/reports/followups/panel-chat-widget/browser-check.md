# Panel chat widget (t852): browser check

Worktree `C:/Users/osrs_/FluxStuff/fxwork/t852/!FluxIQ`, `apps/web`. Nothing committed. Worker report (Sonnet 5.5).

## Outcome

Done. `apps/web/e2e/chat-widget.spec.ts` (10 tests) passes headed on desktop-chromium against the dev server, on
mobile-chromium against the dev server, and on desktop-chromium against the production server (`next build` then
`next start`). The production build passed on the first attempt and its CSS carries the package's rules. Four defects were
found and three fixed in `apps/web`; the fourth is Core's and is reported, not touched. Several inventory items could not be
proven as worded; they are listed under "Not exercised" and "Open questions".

## Environment

- Browser: Playwright Chromium 151.0.7922.34 (`chromium-1234`), headed every run. The machine only had `chromium-1161`, which
  Playwright 1.62.1 will not use, so I ran `npx playwright install chromium` once (downloads into the shared
  `%LOCALAPPDATA%\ms-playwright`; touches no profile). Projects: `desktop-chromium` (1440x900), `mobile-chromium` (320x568).
- Ports: dev 3871, production 3872, both checked free first (3000 never touched). Both servers are mine, started with
  `Start-Process`, PID recorded in `apps/web/test-results/server.pid` (git-ignored), stopped with `taskkill /T /F /PID <that pid>`.
  After the last run: no listener on 3871 or 3872, recorded PID not running.
- Environment names set for the servers: `FLUXIQ_IMPORTER_ROOT` (the worktree's `apps/web/.e2e-host`),
  `FLUXIQ_CLIENT_GATEWAY_ENABLED=false`. `CLAUDE_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` removed from
  the server's environment; the shell held no `*_KEY`/`*API_KEY` variable at all (checked with `env`).
- `apps/web/.env.local` does not exist. The fixture root is created by `fixture:e2e` and holds no model key; the spec reads the
  panel's own Secret Keys snapshot (what the chat itself reads) and sends only if no key is enabled. It read `enabled: false`
  everywhere, so the one typed send ran. It could not reach a provider.
- `.e2e-host`, `.next`, `test-results` are git-ignored (`git check-ignore` confirms); `git status` shows nothing from them.

## Commands

```
FLUXIQ_E2E_CHAT_ONLY=true FLUXIQ_E2E_FAST_STUDIO=true pnpm.cmd --filter @fluxiq/web fixture:e2e
node apps/web/e2e/support/seed-chat-threads.mjs          # server stopped
next dev --turbopack --hostname 127.0.0.1 -p 3871         # FLUXIQ_IMPORTER_ROOT=<abs .e2e-host>, gateway off
FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3871 npx playwright test e2e/chat-widget.spec.ts --headed --project=desktop-chromium --workers=1
FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3871 npx playwright test e2e/chat-widget.spec.ts --headed --project=mobile-chromium  --workers=1
pnpm.cmd build                                            # apps/web, once
next start --hostname 127.0.0.1 -p 3872                   # same env, fresh seed
FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3872 npx playwright test e2e/chat-widget.spec.ts --headed --project=desktop-chromium --workers=1
```

The spec answers asks, so every full run was preceded by a fresh `fixture:e2e` + seed (server stopped by its PID first).
The first dev compile of each route is slow (20-30 s), so I warmed the routes with a login and four page requests before
running. The warm-up and reseed script lived in my scratchpad, not the repository.

## Observed results

| Run | Result |
| --- | --- |
| dev, desktop-chromium, fresh seed | 10 passed (4.2 m) |
| dev, mobile-chromium, fresh seed | 10 passed (3.5 m) |
| production, desktop-chromium, fresh seed | 10 passed (37.9 s) |
| `npx tsc --noEmit` in apps/web | exit 0, no output |
| `npx vitest run src/features/chat-widget --minWorkers 1 --maxWorkers 2` | 15 files, 101 tests passed |
| `node scripts/structure-audit.mjs` | `passed (484 warning(s), 1098 baselined)` (it first failed on one packed statement in my spec, line 36; fixed) |
| `pnpm.cmd build` in apps/web | exit 0, `Compiled successfully in 108s`, 24/24 static pages, `Runtime build identity is stamped: no placeholder in 1179 server files.`; one build, 264 s |

The V8 test was re-run alone once after a spec edit (passed). The mutating tests reached green in sequence only after the
spec fixes below; those intermediate failures are the defect list.

## Step 1: seeding, and what the harness could not do

- `fixture:e2e` does not run any more. With the stock flow it fails on the "small" project: Core now refuses nodes on a
  top-level orchestration Flow ("Top-level orchestration Flows cannot own Nodes or edges..."), and after working around that,
  `saveFlowSubflow` fails ("Subflow graph Flow is required."). The Flow corpus predates Core's Subflow-graph model. I did not
  rebuild it. I added `FLUXIQ_E2E_CHAT_ONLY=true` to `seed-fixtures.mjs`, which seeds the category and bare projects (`small`
  and `empty` hold no Flows) and writes the same manifest. The full-fixture mode is still broken for every other spec that
  wants Flows; that is outside this brief and should be a follow-up.
- `apps/web/e2e/support/seed-chat-threads.mjs` writes threads through
  `fluxiq.programs.automationStudio.conversations` (`writerFor(...)`, `appendTurn`), Core's public collaborator, with the
  server stopped and the root marker checked first. It calls no model. Seeded in "UI Fixture - Small":
  - build thread "Weekly post build": a say, then `askPermission` (send_or_publish, create_new, control "Schedule post");
  - run thread "Cleanup run": 14 filler turns, then a choice ask (options "Clear the oldest", "Clear both", consequence `delete`
    so every option is destructive);
  - project thread "Planning notes": a person turn, a `flow-graph-diff` attachment, an `adaptation:adaptation.e2e.1`
    reference, a person turn carrying `panel-capability-result`, and an open ask.
  "UI Fixture - Empty" has no threads. Ids are written to `.e2e-host/chat-threads-manifest.json`.
- Shapes Core's public API cannot produce: a resolvable `flow-graph-diff` payload. The conversations collaborator is
  constructed with no attachment resolver, so `get-conversation-attachment` answers 400 for any kind. The diff reference is
  seeded, but it can only draw the "could not be read here" state. A drawn graph diff is not exercised (see below).
- The landing screen with no threads at all (disabled composer with its reason) is not reachable here: the seeded threads span
  projects, and the empty root is not available once seeded. Not exercised.

## Step 3: what each test did against what was seeded

All under `chat-widget.spec.ts`; screenshots in `apps/web/test-results/chat-<project>-<name>.png`.

1. **D1** landing `/programs/automation-studio`: launcher visible, wrapper `position: fixed`, inside the viewport, and
   its box unchanged after a mouse wheel.
2. **V8** landing, no project open: badge lit (data-waiting), window opens, real thread select, picks the project thread and
   reads its turns (a thread from a project that is not open), no project id in the window.
3. **D2-D6, V1, V2, V7, T3, U2, U4, U6** in the project: collapsed window still counts waiting threads (badge "3", "Needs you",
   launcher label "3 threads are waiting on your answer", panel `hidden` but present once); launcher bottom above the
   Studio's "Action Preview" bar; opening focuses the dialog; Escape closes and returns focus to the launcher; wider and narrower
   change the width and restore it; the picker is a real `<select>` of three options all "(waiting on you)", no project or thread
   id on screen; the pending banner; the record turn "Opened the Runs view." is not in a bubble and its author "FluxIQ panel" is
   attached; the person's turn is in a bubble; the diff reference shows "Proposed Flow change could not be read here." with
   Open; Open on the adaptation reference opens the Adaptations view ("Adaptation Inbox") while the window stays open.
4. **A1, A3, A4, A6** permission ask: title, description, consequences list labelled "Consequences requiring approval", the
   control note, Allow opens the real PIN dialog ("Allow this action"), its close button on the title's row, Escape inside the
   dialog leaves the window open, a routed 403 stands in for a refusal and the dialog stays open showing "The security PIN was
   not accepted." (answer not sent), then the fixture's `securityPin` answers and the ask settles (Allow gone).
5. **A1, A3, A4** choice ask: every option destructive (red), consequence "delete or remove something", pressing an option
   opens "Confirm this answer", Cancel sends nothing and both options remain.
6. **A2** open ask: Send answer disabled when empty, enabled with text, sends, the textarea goes, the chat's own "You answered."
   remains and no button (A6).
7. **T3/T8** Show me: on the 14-turn thread, wheel to the top (also stops tail-following), Show me raises the transcript's
   `scrollTop` and `window.scrollX/Y` is unchanged; the transcript list is `aria-live="polite"`.
8. **C4, C1** storage: with a draft typed and after a reload, no conversation word, no thread title and no draft is in
   `localStorage` or `sessionStorage`; then, since the Secret Keys snapshot showed no enabled key, a typed message plus Enter
   stored the turn (it appears as the person's bubble) and is not in storage either.
9. **V4** empty project: the welcome ("This is where FluxIQ talks to you", its three items), no picker, heading carries
   "UI Fixture - Empty", no id.
10. **Chat alone** `/programs/automation-studio/chat?projectId=`: main "FluxIQ chat", picker, the thread's turns; without
    `projectId` the "Say which project to chat about" page.

Screenshots I read (desktop 1440x900): landing-launcher, landing-open, permission-ask, pin-dialog, pin-refused, choice-ask,
adaptation-opened, welcome, typed-send, chat-alone, plus the production permission-ask. Chat text readable, tokens map (no
unstyled or black-on-black parts), nothing overflowed; the launcher clears the bottom bar. Mobile (320x568): permission-ask,
pin-refused, landing-open. Readable and scrollable; the pending banner stacks and takes about a fifth of the window's height,
leaving the ask card cramped under it (cosmetic, left). The black round button at the bottom left of dev screenshots is Next's
dev indicator, absent in production.

## Defects found and fixes

1. **Open on an attachment never appeared in the Studio's window (U6, U4).** `AutomationStudioSession.tsx` renders
   `<ChatDock projectId={null} />` on the landing return and `<ChatDock projectId=... onOpenAttachment=...>` on the project return;
   they sit at the same tree position, so React kept the landing instance, and the chat reads its options (hence "can this
   host open an attachment") once when made. Result: after landing -> project, attachments had no Open button. Fix: `key="landing"`
   and `key="workspace"`. Observed after: Open appears and the adaptation reference navigates. Trade-off: a window left open on
   the landing screen closes when a project opens (the chat is remade), and the same when a URL-restored project finishes loading;
   a person reopens it. Alternative if that is unwanted: make `ProgramChatWidget` read the open handler lazily, which needs the
   package to draw Open from a late-bound host and is a package change; left to the supervisor.
2. **The PIN dialog's close button wrapped under the description** (all "Modal"s with a long description, including this one).
   `.panel-heading { flex-wrap: wrap }` plus the description's 62 ch. Fix:
   `.modal-panel > .panel-heading { flex-wrap: nowrap; }` in `15-modals-and-drawers.css`. Verified by the spec (close button on the
   title's row) and by the screenshots.
3. **`fixture:e2e` broken against Core's Subflow-graph model** (see Step 1). Fixed only for this check, with an opt-in mode.
4. **Not fixed, Core's: a wrong PIN is accepted.** `answer-ask` ignores `authorizationPin`: the endpoint is classed `authoring`
   because "the act itself is still gated where it happens" (`programs/automation-studio/api/handlers/conversations.ts`). For a
   permission or choice ask that carries no `panel-capability` invocation nothing ever checks the PIN, so typing 000000 settled
   the ask in my first run ("You allowed this."). The old UI did the same (the PIN was only passed to `runConversationCapability`
   after a granted command ask), so this is not a regression from t852, but it means A3/A4 are ceremony for plain asks. I could
   therefore not prove "wrong PIN keeps the dialog open" with a real server; the spec stands in for the refusal with a routed 403 to
   prove what the dialog does with one. Whether the panel should verify the PIN itself needs a decision; changing Core was out of
   scope.

Also found and handled in the spec: the dev server resets the first request after a page is torn down mid-request (the login
POST failed with ECONNRESET twice); the spec retries login up to four times. The production run needed no retries.

## Inventory ids now proven in a real browser (desktop; also on mobile-chromium unless noted)

D1, D2, D3 (collapsed, still counted), D4, D5, D6 (against the Studio bottom bar; the narrow-screen offset only as seen on mobile
screenshots), V1, V2, V4, V6 (only the not-disabled half: composer enabled with threads), V7, V8, T3, U2, U3 (author attached; hover
title not asserted), U4 (failed read and reference-with-Open states), U6, A1, A2, A3 (permission, choice), A4 (dialog refusal path,
refusal simulated), A6, C1 (Enter sends), C4, T8 (list is `aria-live`; see label below), G1 only as far as the landing window
works. The chat-alone route and the `onSelectedConversationChange` restore were not separately asserted.

## Not exercised, and why

- **Model-key control navigating in place.** Unreachable: with the panel's `welcome` option the package never draws the model-key
  line (`emptyStateModel` returns `keyLine: null` for a welcome, pinned by `thread-header.test.ts`), so no "Open FluxIQ" exists
  on the empty project even though no key is enabled. So a person without a key sees no hint. This looks like an omission in the
  port design; needs a decision (the fix is one line in the package plus its test). The control's code is covered by
  `panel-open-control.test.ts` only.
- **Drawn graph diff (U5).** Core wires no attachment resolver, so the payload cannot be produced through the public API.
- **Composer disabled with its reason (V6), loading (V5), failed read notice (V3), history/"Show earlier" (T2), "New turns below"
  (T1), live line (T6/T7), A5 (granted panel capability runs with the PIN), H1-H4, C2, C3, V9, V10.** No fixture for them without a
  provider or a run; no browser proof here.
- **No reply from Core to the typed message.** I only proved the turn is stored and not in storage; with no key Core cannot
  answer, and I did not wait for or inspect its reply.
- **Firefox, Edge, mid-width and 200% projects; a real wrong PIN; the `.chat-window` on pages other than the Studio.**
- Escape inside the PIN dialog closes the dialog (it takes Escape for itself) and leaves the window open, as the test asserts; I
  did not assert the dialog stays open on Escape because it does not.

## Open questions

1. T8: the inventory says the transcript is labelled "Conversation transcript" (the old UI's words). The widget's list is
   labelled "Conversation with FluxIQ" (shared with the extension), so the accessible name changed. Words were meant to be kept;
   an optional label in `ChatWidgetOptions` would keep both. Not changed (shared package, extension-visible).
2. Defect 1's trade-off (window closes on landing -> project).
3. Defect 4 (PIN not verified for plain asks) and the model-key line (above).
4. `fixture:e2e` full mode needs rebuilding for Subflow graphs before the other e2e specs that use Flows can run.

## Files changed

`apps/web/e2e/chat-widget.spec.ts` (new), `apps/web/e2e/support/seed-chat-threads.mjs` (new),
`apps/web/e2e/support/seed-fixtures.mjs` (chat-only mode), `apps/web/e2e/README.md` (short section),
`apps/web/src/features/automation-studio/live/components/AutomationStudioSession.tsx` (two keys),
`apps/web/src/app/styles/global-foundation/15-modals-and-drawers.css` (one rule). `packages/ui-components` was not changed, so no
rebuild there. `next.config.ts` untouched: it already lists `transpilePackages: ["fluxiq"]` and needed no entry for
`@fluxiq/ui-components` (the package's CSS import resolved through the production build as is).

## Production CSS

`pnpm.cmd build` output above (exit 0, first attempt). `grep` over `.next/static`: `.chat-window` in 5 CSS files,
`.chat-panel` in 3, `.chat-window-launcher` in 3; for example `chunks/0f43318923ebcc8f.css` holds
`.chat-window{right:16px;bottom:var(--chat-window-bottom,16px);z-index:40;...`, `.chat-window-panel{border:1px solid
var(--divider);...` and `.chat-panel{background:var(--surface);min-width:0;height:100%;...`. The spec against the production
server (3872) passed 10/10 headed and its screenshot shows the styled window.
