# One chat UI in the web panel (t852): sub-supervisor report

## Outcome

Done. The panel now has one chat, the `@fluxiq/ui-components` widget. The Studio's window (landing screen and workspace) and
`/programs/automation-studio/chat` both mount it through `apps/web/src/features/chat-widget`. The six capabilities are in the
package as optional ports. The panel's own conversation UI is deleted, with no forwarding files. The extension was not edited and
still builds and passes. The production CSS gap is closed: the build passed and a headed browser ran against `next start`.

Limits worth reading first, all detailed below:

- The production build ran once, before my last two small fixes (window stays open, model-key line). Those were proven in a headed
  browser against an isolated dev server, not against a production build.
- A wrong PIN cannot be refused on a plain permission or choice ask, because Core does not check it there. This is Core's stated
  design and the old UI behaved the same. It needs a decision.
- A real polling beat remains (10 s). The panel has no push channel, so "change feed in place of polling" means changes this tab
  knows of are read at once and the poll drops from 4 s to 10 s.

## Workers

| Label | Tier | Brief | Outcome | What I verified |
| --- | --- | --- | --- | --- |
| pkg-threads | Sonnet `worker` | thread target, list, picker, restore, heading, change feed, background, history, welcome, window | Done | tsc, package vitest, audit re-run; read report and options |
| pkg-asks | Sonnet `worker` | presenter, PIN, attachments, records, turn meta, banner, composer options, notice | Done | package vitest re-run (520 at that point); read report |
| web-integration | Sonnet `worker` | transport, ports, `ChatDock`, navigation, deletion, test ports | Done | tsc, vitest over changed folders, grep, audit re-run; read `ChatDock`, `ProgramChatWidget`, inventory |
| browser-check | Sonnet `worker` | isolated seed, headed spec, one production build | Done | read report; re-ran the spec myself after my fixes; checked Core's PIN and resolver claims by grep |

No `worker-heavy`: I wrote the ports and the design (`panel-chat-widget/port-design.md`). No escalation. Worker reports are in `panel-chat-widget/`.

## Integration I did

- The ports (`ports/ask.ts`, `attachment.ts`, `threads.ts`, additions to `transport.ts`, `host.ts`, `target.ts`).
- **Plus and minus icons** on the diff's rows, which web-integration had dropped because the package lacked them (`icons/chrome-nodes.ts`, `flow-graph-diff/draw.ts`).
- **Model-key line under a welcome.** The package never drew it once a host passed `welcome`, a design omission of mine, so a person with no key got no hint and capability 6's control could not be reached. `emptyStateModel` now keeps the line on the latest chat, the read runs, and the test that pinned the omission is corrected.
- **The panel's control says where it goes**: "Add a model key" and "Open the Studio", not "Open FluxIQ", in `navigation/panel-open-control.ts`.
- **Window stays open from landing into a project.** browser-check's fix (`key`s on the two mounts) closed the window at that move, which the old dock did not do. I removed the keys and added an optional `canOpen()` to `ChatAttachmentPort`, asked each time a reference is drawn, with a dock test.
- `ownerKey` option's comment now says to leave it out with `threads` (web-integration's finding).
- Docs: `docs/architecture/package-boundaries.md`, root `README.md`, `packages/ui-components/README.md`.

## Feature inventory

Pkg = test in `packages/ui-components`. Dock = `chat-widget/tests/ChatDock.test.tsx`. Browser = `apps/web/e2e/chat-widget.spec.ts`, headed. Full per-id test names: `panel-chat-widget/web-integration.md`.

| Id | Feature | Now lives in | Proof |
| --- | --- | --- | --- |
| [x] D1 | Launcher always on screen, landing and workspace | `createChatWindow`, `ChatDock` in both Session mounts | Browser, dock, pkg |
| [x] D2 | Badge count, "Needs you", label naming the count | window, `conversationLauncherLabel` | Browser, dock, pkg |
| [x] D3 | Collapsed not unmounted, keeps reading | `hidden`, `setBackground` | Browser, dock |
| [x] D4 | Escape closes, focus returns, not under a modal; focus on open | window, `escapeBlocked` | Browser, dock, pkg |
| [x] D5 | Wider/narrower, bar with name and collapse | window | Browser, pkg |
| [x] D6 | Bottom offset above the status bar | `--chat-window-bottom` in workspace CSS | Browser against the Studio bar; narrow offset by mobile screenshots only |
| [x] V1 | Picker: names, "(waiting on you)", date on repeats, no id | `thread-header`, `threadOptions` | Browser, pkg |
| [x] V2 | Heading: title, project name, noun, "All projects" | `conversationDisplayTitle`, `onTitle` | Browser, dock, pkg |
| [x] V3 | Failed read named, transcript stands, one failure silent | controller | Pkg only |
| [x] V4 | Opening message and three arrivals | `options/welcome.ts` | Browser, dock |
| [x] V5 | Loading state | package | Pkg only |
| [x] V6 | Composer disabled only with no thread and no project, with reason | `unavailableReason`, `setUnavailable` | Dock, pkg; not in a browser, an unseeded root was not reachable |
| [x] V7 | Opens on the waiting thread; sort order | selection, `sortThreadsForList` | Browser, pkg |
| [x] V8 | Thread carries its own project; list spans projects | target, transport getter | Browser (reads), dock (activity, attachment) |
| [x] V9 | Restore and selection callback | `initialConversationId`, `onSelected` | Dock only. Session passes neither, as before |
| [x] V10 | `onScreen` with every message | `conversation-port.send` | Dock, unit |
| [x] V11 | No Refresh | `thread-header` | Pkg |
| [x] T1 | Follows tail; control when behind ("Jump to latest", not "New turns below") | scroll follower | Pkg only. Words differ |
| [x] T2 | 200 turns, "Show N earlier turns" | `history`, `showEarlier` | Pkg only |
| [x] T3 | Waiting banner, Show me scrolls the transcript only | `pendingBanner`, `show-turn` | Browser, pkg |
| [x] T4 | Tail found on opening | `setBackground(false)` | Pkg; opening seen in browser, not asserted as a tail |
| [x] T5 | Step messages, cards, no tool or node id | package stream | Pkg; old web copies deleted |
| [x] T6 | Live line in its own thread | `target-activity` | Pkg only; no run in the browser |
| [x] T7 | Long build's steps kept | activity port, step limit | Unit, pkg |
| [x] T8 | `aria-live`; transcript label | `thread-view` | Browser for `aria-live`. Label is now "Conversation with FluxIQ", shared with the extension, not "Conversation transcript": a wording change, kept on purpose |
| [x] U1 | Bubble and formatted text | package | Browser (bubble), pkg |
| [x] U2 | Panel record turns: quiet line, "FluxIQ panel" | `isRecord` | Browser, unit, pkg |
| [x] U3 | Author and time, hidden and on hover | `turnMeta` | Browser (author), pkg |
| [x] U4 | Attachment states, Open, hidden kinds | `attachment-view`, port | Browser (failed read, Open), dock (drawn), pkg |
| [x] U5 | Flow graph diff table, strict parse, refusal | `attachments/flow-graph-diff` | Unit, dock with a fake read. Not drawn in a browser: Core wires no attachment resolver, so the real panel answers "could not be read here". Same as the old UI |
| [x] U6 | Adaptation reference opens the Adaptations view; others say no screen | `onOpenAttachment` | Browser (adaptation); "no screen" branch unchanged and not re-run |
| [x] A1 | Ask words, consequences, control note, tones, hover | `asks/present-ask.ts`, `presented-ask` | Browser, unit |
| [x] A2 | Open ask textarea, limit, hint | same | Browser, unit |
| [x] A3 | PIN on grant, confirm with consequences, destructive choice; not on deny or text | `reauthorize` | Browser (permission, choice), unit |
| [x] A4 | Wrong PIN keeps dialog with reason; Cancel sends nothing; answer carries the PIN | `ReauthorizeDialog`, `answer-ask` | Browser, with the refusal routed (see below); dock |
| [x] A5 | Granted `panel-capability` runs that invocation with the PIN; unreadable runs nothing | `transport/answer-ask.ts` | Unit, dock. Not in a browser |
| [x] A6 | Settled ask shows its outcome | package | Browser, pkg |
| [x] C1 | Enter, Shift+Enter, IME, empty, spinner, hover | composer, `sendHint` | Browser (Enter), pkg |
| [x] C2 | Grows, limit, "N characters left" | `composer` option | Dock (limit), pkg |
| [x] C3 | Words kept on failure; newer typing kept | composer | Pkg only |
| [x] C4 | No browser persistence of conversation content | `keepDraft: false` | Browser, unit, pkg |
| [x] C5 | First message opens a thread | package, transport | Dock; browser sent into a seeded thread only |
| [x] H1 | Instruction send, Core's execution, panel runs the rest, `problem` shown | `conversation-port`, `state.notice` | Unit. Browser proved the turn is stored; Core's reply was not read |
| [x] H2 | `conversation.changed` committed and heard; `runtime-run.changed` heard | `changes-port`, `run-port` | Unit, dock. A build stopped by its Flow commits nothing: the mutation needs a run id |
| [x] H3 | Keeps reading a project with no thread | package | Dock, pkg |
| [x] H4 | Slow beat hidden, read on visible | `read-beat`, activity port | Pkg, unit. Fixed 10 s beat replaces the adaptive backoff for the thread; activity keeps its backoff |
| [x] G1 | `GlobalConversationPrompt` stands down in the Studio, links lead to the new UI | unchanged | `conversation-architecture`, kept tests |

Added beyond the old UI: Stop, Take over, Hand back, "Show the question", read notice with Retry, recording attach, model-key line.

## Commands and observed results

- `packages/ui-components`: `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2` -> `Tests 522 passed (522)`, 80 files. `pnpm.cmd build` -> `ui-components:build ... stored in the shared store (509 file(s))`.
- `apps/web`: `npx tsc --noEmit` -> exit 0, no output. `npx vitest run src/features/chat-widget src/features/automation-studio/conversation src/features/automation-studio/live src/features/automation-studio/styles src/features/automation-studio/shared src/features/automation-studio/tests src/app/tests src/app/styles src/app/programs/automation-studio --minWorkers 1 --maxWorkers 2` -> `Test Files 75 passed (75)`.
- `apps/web` production build, one run, by browser-check: `pnpm.cmd build` -> exit 0, first attempt, `Compiled successfully in 108s`, 24/24 static pages, `Runtime build identity is stamped: no placeholder in 1179 server files`, 264 s. `next.config.ts` needed no entry for the package. Worker's grep over `.next/static`: `.chat-window` in 5 CSS files, `.chat-panel` in 3. Against `next start` on 3872: 10 of 10 headed.
- Core root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (485 warning(s), 1098 baselined).` `--rule browser-imports` -> `passed (0 warning(s), 0 baselined).` `.structure-baseline.json` has no diff.
- Extension, `apps/extension` untouched, `git status` empty: `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0. `... build` -> `chrome`, `firefox`, `e2e-chromium: verified 22 files`. `node scripts/test-extension.mjs panel/chat`, run from `apps/extension` where the script is -> 15 pass, 0 fail. The check first failed twice, on a stale package build after my README edit and on a missing `domain/dist` in the new worktree. Rebuilding both cleared it; neither was a port change.
- Search: `grep -rlE "ConversationDock|ConversationViewContent|ConversationView\b|useConversationThread|useConversationCommands|conversation-host|automation-conversation-|ConversationComposer|ConversationAskForm|ConversationAttachmentPanel|FlowGraphDiffAttachment|studioOpenControl|studio-open-control|conversationStream|usePacedConversationActivity|useConversationActivity" apps packages scripts` -> no file. No import or `@import` of `conversation/components`, `conversation/text`, `styles/conversation` or `activity/steps`.
- Package boundary: no `chrome.`, no `node:`, the one `automation-studio` hit is an existing comment in `core-thread.ts`.
- Headed browser on the final tree, my run, isolated dev server on 3871, fresh seed: `FLUXIQ_E2E_BASE_URL=http://127.0.0.1:3871 npx playwright test e2e/chat-widget.spec.ts --headed --project=desktop-chromium --workers=1 --global-timeout=480000` -> `10 passed (2.9m)`, including the key line and "Add a model key" going to `/programs/secret-keys` in the same tab, and Open on an adaptation reference with the keys removed.
- My first attempt at that run did not pass. It ran while I had vitest and the extension check going, and test 8 failed: `locator.fill: Timeout 10000ms exceeded`, the composer disabled with "Loading the conversation" while API reads took about 5 s. Playwright then hung in that test's teardown, and I stopped it by PID after 15 minutes, seven tests done. On an idle machine the same test passed. The composer staying disabled until its first read lands is the widget's existing behaviour and is a difference from the old composer, which took text at once (see open question 6).

## What the browser check really exercised

An isolated panel in this worktree: `FLUXIQ_IMPORTER_ROOT` at the git-ignored `apps/web/.e2e-host`, gateway off, ports 3871 and 3872, Playwright Chromium headed, a temporary browser profile. The user's panel, port 3000, real profiles and `.fluxiq` were not touched. No website was opened, only the panel's own pages. No key existed in the environment, `.env.local` or the root, and the spec read the Secret Keys snapshot before its one send, so no provider call could happen.

Threads were written through Core's public conversations collaborator with the server stopped: a pending permission ask, a choice ask with destructive options, an open ask, a record turn, a `flow-graph-diff` reference and an `adaptation:` reference. The spec's steps, with what each one proved, are in `panel-chat-widget/browser-check.md`.

Not exercised in any browser: a drawn graph diff (U5), a real wrong PIN (Core does not refuse one, so a routed 403 stood in), the disabled composer, read-failure notice, "Show earlier", tail control, live line, A5, H1 to H4 beyond the stored turn, V9, V10, C2, C3, Firefox, Edge, and mid-width and 200% viewports. These have the unit proof in the table, which is not browser proof.

My re-run used `next dev`, which writes to the same `.next`, so I did not re-grep the production output; that record is the worker's. `npx playwright install chromium` downloaded a browser into the machine's shared Playwright cache, the only file written outside the worktree. My servers are stopped by PID and 3871 and 3872 have no listener. One orphan from the hung run remains: PID 11180, a `chrome.exe` of that temporary profile, which `taskkill` reports as having no running instance while `tasklist` still lists it. It holds nothing of the user's and should go with the next reboot.

## Not verified

- A production build of the final tree: see Outcome.
- Live Core with a real run, build or model reply through the widget. No provider or Lab in this lane.
- Whole Core, web or extension suites, by rule. Web folders I did not change were not run.
- e2e specs other than the new one: full `fixture:e2e` cannot save Flows against Core's current Subflow-graph rule, so they cannot be seeded. This predates this lane. I left it, with an opt-in `FLUXIQ_E2E_CHAT_ONLY` mode for this spec.

## Open questions for the lead

1. **PIN on plain asks.** `answer-ask` ignores `authorizationPin`; `programs/automation-studio/api/handlers/conversations.ts` says the act is gated where it happens. For a permission or choice ask with no `panel-capability` invocation, any PIN settles it. The old UI did the same. So the dialog is ceremony there. Whether to verify it needs a Core change, outside my paths.
2. **Attachment resolver.** Core constructs its conversations with no resolver, so `get-conversation-attachment` answers 400 for every kind and the diff renderer has nothing to draw in a real panel. Also outside my paths.
3. **`.structure-baseline.json`** still lists the deleted files. The audit tolerates it. `pnpm structure:baseline` should run at commit; I do not own that file.
4. **Full `fixture:e2e`** needs rebuilding for Subflow graphs.
5. **Merge notes.** `pnpm-lock.yaml`, `next.config.ts` and `packages/fluxiq` show no change. The extension worktree has no change, so only Core commits. `packages/ui-components` has no version bump, per the brief; it gained minor features, and AGENTS' published-package rule would bump it to 0.2.0 when this merges.
6. **Composer while a thread loads.** The old composer took text the moment a project was open. The widget's is disabled, with the reason in its placeholder, until the thread's first read lands, which is normally a moment but about 5 s under load. Shared with the extension, so I left it.
