# Panel chat follow-ups (t855): worker report

## Outcome

Items 1, 2, 3 and 4 are done. Item 5 is partly done: the slow first read is explained and one real defect behind it is fixed, but the teardown hang did not reproduce, so its cause is not proven.

Scope change: the user's narrowing arrived after items 2 and 3 were already working and the production build and panel spec had already run, so both items are kept and nothing is listed as dropped. Only the optional Phase 8 "ordinary" seed was stopped. No commit. The extension worktree has no change.

**Decision for the user to check:** a paired client (the extension) can still grant a move-money, delete or send permission with one press and no PIN. It asks for no PIN, so what the brief forbids does not apply there, and Lab runs press "Allow" there. If the user wants a PIN in the extension too, the package's ask port already supports it; the extension would need to supply a dialog.

## Item 1: a PIN that cannot fail

Which asks really gate an act, traced through the code:

| Ask | What the answer does | PIN now |
| --- | --- | --- |
| Permission, raised by the action gate | A grant widens what the run holds and the run goes on to the act. Nothing checks again. | Yes, when `missing` names money, delete or send |
| Any ask a run waits on (`parks`) that names one of those classes | Its route goes on to the act | Yes, every answer but a refusal |
| `panel-command.*` confirm | The panel runs the capability with this PIN, and that endpoint checks it. Before this fix, a wrong PIN settled the ask first, then the run failed, and the ask could not be answered again. | Yes, checked before the answer is written |
| `conversation-command.*` confirm (`adaptation.apply`) | Applies a change. `modify_existing` is not a class a person must be asked about, and a typed yes already works. | No (the panel used to ask, and nothing checked it) |
| `declaration-cross-check:*` confirm | No reader: nothing acts on the answer | No (the panel used to ask) |
| Approval node, robot check, result check | No gated class named | No |

- **Core's decision:** `runtime/conversations/answer-pin.ts`, `automationStudioConversationAnswerNeedsPin`. A refusal never needs a PIN, and a resend of a settled answer is not asked again.
- **Where it is checked:** the `answer-ask` handler calls the existing `authorizeProgramPin` before the answer is written. The endpoint stays `authoring`.
- **Refusal:** `Invalid PIN`, or `PIN is required for this action` when none is sent. The ask stays pending and the dialog stays open.
- **Panel:** `thread/answers.ts` now asks exactly where Core checks. A web test compares the two across a matrix of ask kinds, ids, `parks` and classes.
- **Choice asks:** every option of a gated choice takes the PIN, because Core stores consequences on the ask, not on an option.
- **Secret handling:** nothing logs or echoes the PIN. It is not in the answer's mutation digest, the audit gate reads no payload, and a test checks the refusal does not contain it.
- **Attempt policy:** no PIN attempt limit exists to reuse, so none was added. Wrong PINs can be retried without limit, as on every destructive endpoint.

**Extension adapter:** unchanged and correct. The relay sends no PIN, and Core exempts `channel: "paired-client"`, which the server sets itself. A paired token cannot supply an auth session, so a PIN check could only fail closed there.

Known gaps, both left as they are:

- A `panel-command.*` ask opened in the extension (a thread started in the panel) can be answered "Yes". That settles it and runs nothing, because only the panel runs those. The extension's own chat capabilities declare none of these. This predates t855.
- An `open` ask naming a gated class would be refused at Core with no way to give a PIN. No raiser in Core writes one today.

## Item 2: the graph diff draws

- **Reference:** `flow-graph-diff` now means `<flowId>:<adaptationId>`, a real bootstrap proposal.
- **Resolver:** `runtime/conversations/attachments/` compares the proposal's topology with the Flow's current graph. Output is in words, with no definition ids. It also serves `panel-capability-result` and refuses any other kind by name.
- **Wiring:** the handler passes the resolver per call, so the handler stays thin and `service.ts` (outside my paths) is untouched.
- **Producer:** Core wrote no such reference before, so a real diff could never appear. `flow.improve` now writes one just before its question, for callers that are not paired. The extension has no drawer for it, so it gets no such turn.
- **After apply:** the earlier graph is gone, so an applied proposal shows what it added and reads kept steps as unchanged.

## Item 3: fixtures

`seed-fixtures.mjs` now saves parent Flows with no nodes, creates Subflows through `createFlowSubflow`, rewrites generated Subflow ids to the real ones, and puts the stress graph on the primary Subflow's graph Flow. Recordings carry the required description. `verify-fixtures.mjs` reads the graph Flow. `FLUXIQ_E2E_CHAT_ONLY` is removed. Core's rule was not weakened.

## Item 4: the composer takes text while a thread loads (shared)

- The box takes words during `scopeState: "loading"`; only `"error"` disables it.
- A send pressed during loading is held: the words stay in the box and a line says "This goes as soon as the conversation is ready." It goes when the read lands.
- Editing the words, or changing chat, lets go of the hold.
- A failed read says "Not sent: the conversation could not be read. Your words are still here." It does not send later by itself.
- The extension's default chat, which follows its host's project, has no such wait and sends at once, as it always has. A project opened with `chat.open` holds, like the panel.

## Item 5: the slow read and the hang

**The first symptom is gone:** typing no longer waits for the read.

**Why the read was slow.** Core is not the cause. Measured on the fixture root:

| Measure | Result |
| --- | --- |
| Core's own `get-conversation` | 4 to 11 ms; ten at once took 30 ms in total |
| Same read over HTTP, `next start` | 13 to 49 ms |
| Same read over HTTP, `next dev` | About 430 ms, even for `get-activity`, which takes 0 ms in Core; 15 at once took 2.5 s |
| Pick thread to thread shown, `next start`, idle | 52 to 205 ms |
| Pick thread to thread shown, `next dev`, idle | 3.1 to 5.7 s |
| Pick thread to thread shown, `next dev`, 8 CPU burners | 9 s in the round read back; one read spent 6.2 s queued |

What adds up to the delay:

1. **A real defect in the shared widget, now fixed:** `controller.refresh()` made a newly picked thread wait for the previous thread's read to land, though that result is thrown away. In one idle dev round the new read started 3.9 s after the pick. The dev and under-load timings above were taken before this fix; only the `next start` timings include it.
2. **The dev server's cost per request:** about 430 ms alone, with concurrent requests handled roughly one after another.
3. **The Studio's burst of requests:** 15 to 20 in flight, queued behind the browser's connection limit. Up to 6.2 s of one read was spent in that queue.

Under load these add up to the 10 s seen on 2026-11-02. I did not pursue a priority for the chat's reads, because the production timings do not need it.

**Teardown hang: not reproduced, cause not proven.** Failing tests ran to a normal exit twice, once idle and once in 155 s under 8 CPU burners, the second copying test 8's failure.

Best explanation, unproven: Playwright waits without a time limit for the browser process's `close` event (`processLauncher` in `coreBundle.js`), and that event needs its stdio closed. The earlier run's renderer, PID 11180, is still alive with 1 thread, 286 handles and a parent that appears to be gone. If it inherited the pipe, that would produce this hang. I could not check its handles. No fix was made.

## Commands and observed results

- `packages/ui-components`: `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 --reporter=dot` -> `Test Files 82 passed (82)`, `Tests 529 passed (529)`.
- `apps/web`: `npx tsc --noEmit` -> exit 0. `npx vitest run --minWorkers 1 --maxWorkers 2 src/features/chat-widget src/features/automation-studio/conversation` -> `Test Files 31 passed (31)`, `Tests 271 passed (271)`.
- `packages/fluxiq`: `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 src/runtime/conversations src/programs/automation-studio/api src/programs/automation-studio/tests/conversation-parking.test.ts` -> `Test Files 61 passed (61)`, `Tests 490 passed (490)`.
- Wrong-PIN test seen failing first, before the fix: `Tests 4 failed | 4 passed (8)`, `expected { ok: true, …(1) } to match object { ok: false, error: 'Invalid PIN' }`. It passes now.
- Core root: `pnpm.cmd --filter fluxiq check` -> `build-cache` stored, no error. `node scripts/structure-audit.mjs` -> `structure-audit: passed (487 warning(s), 1097 baselined).` `.structure-baseline.json` has no diff.
- Extension root: `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0, `core-build: FluxIQ Core's build ... is current with its source.` It first failed on a missing `domain/dist` in this worktree; `pnpm.cmd --filter @fluxiq-web-extension/domain build` cleared it.
- From `apps/extension`: `node scripts/test-extension.mjs panel/chat` -> `# tests 15`, `# pass 15`, `# fail 0`.
- Fixtures, in a marked temporary root: full `seed-fixtures.mjs` -> exit 0 in 186 s. `verify-fixtures.mjs` -> `verify-exit 0`.
- One production build: `pnpm.cmd build` in `apps/web` -> exit 0 in 3m02s, `Runtime build identity is stamped: no placeholder in 1179 server files.` It ran before the scope change reached me.
- Headed spec, isolated panel, `apps/web/.e2e-host`, gateway off, no key, no provider call, no fixture website:
  - `next dev` on 3871: `11 passed (4.5m)`.
  - `next start` on 3872: first run failed test 9, with 8 passed and 2 skipped. Second run failed D1, with the rest skipped. Third run: `11 passed (43.4s)`.
  - Both failures were faults in the spec, and both are fixed. Test 9 picked the thread the window had already opened on, so the send correctly went at once. D1 measured the launcher before it grew to say "Needs you". These edits touch the spec only, so no second build was needed.

## What the browser proof covers

**Got, headed Chromium, panel only:**

- A real wrong PIN (`000000`) refused with "Invalid PIN" on a permission ask and on a choice ask, the dialog staying open, then the right PIN settling the permission ask.
- The composer enabled during a held read, the send held with its line showing, then going through. Reads were held by a Playwright route.
- A real proposal's diff: the table contains "Start the post" and "Finish the post", has 3 "Added" rows, and shows no definition id.

**Did not get:**

- **The extension in a browser.** The shared widget's change there is proven only by the package's tests, the extension check, and its 15 `panel/chat` tests. Those 15 do not exercise the hold itself. No extension browser run, no Lab, no Firefox or Edge.
- **A picture of the diff table.** Its text assertions pass, but both screenshots show the transcript elsewhere: the first was not scrolled to it, and the element screenshot caught a neighbouring turn. I did not chase whether the transcript scrolls back on its own, so its look is unchecked.
- **A real `flow.improve` turn in a browser.** The turn is proven in a Core test; the end-to-end read of a real proposal is proven in `extension-chat.test.ts`.
- **A granted `panel-command.*` run in a browser** with the PIN.
- **Phase 8 "ordinary" fixtures.** I stopped that seed under the scope change, so it is unverified. The default seed and its verify did pass, but no other e2e spec was run against the new fixtures, and they may still assume nodes on the top-level Flow.

## Leftovers and process state

- My servers on 3871 and 3872 are stopped; no listener remains. I stopped my own stray seed process after the task stop left it running.
- No browser from my runs remains. The one listed Playwright renderer is PID 11180, profile `playwright_chromiumdev_profile-V9kU5f`, from before this work. My `taskkill` on it was denied by the permission classifier, so I left it. It should go with a reboot, or the user can end it.
- Temporary measurement specs and the probe were deleted from the worktree. Git-ignored outputs remain in `apps/web` (`.e2e-host`, `.next`, `test-results`).
- I ran `git stash list` once by accident. It is read-only and changed nothing.

## Open items for the lead

1. **Doc outside my paths:** `docs/architecture/automation-studio/client-gateway.md`, the bullet near line 465, says the act an answer answers "is still gated where it happens". It should say that a signed-in person's answer that is the authority for an act takes their PIN at `answer-ask`, and that a paired client's press stands without one.
2. **Versions at merge:** `fluxiq` and `@fluxiq/ui-components` both need a minor bump, not done here per the brief. The notes are in `docs/architecture/package-boundaries.md`.
3. **Other callers:** a host calling `answer-ask` as a signed-in person must now send the PIN on gated answers. I found no other caller in either repository. `conversations.answerAsk` itself is unchanged.
4. **Merge order:** Core only; there is nothing to commit in the extension.
