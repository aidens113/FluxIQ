# t856: no PIN in the middle of a Flow

## Outcome
Done. Answering a permission ask or any question a run or build waits on takes no PIN, for a signed-in person or a paired client, whatever class it names. Only a `panel-command.*` confirmation naming a gated class still takes one.

## What changed and why
Core (`packages/fluxiq`)
- `runtime/conversations/answer-pin.ts` is now `panel-command-pin.ts`. It keeps `AUTOMATION_STUDIO_PANEL_COMMAND_ASK_PREFIX`, `automationStudioConversationAskGatedClasses`, and a decision renamed `automationStudioPanelCommandAnswerNeedsPin` (true only for a non-deny answer to a `panel-command.` ask naming a gated class). The permission/parks branches and their wording are gone. The old export name never shipped (unreleased).
- `api/handlers/conversations.ts`: uses the renamed decision; header and `authorizeAnswer` comments rewritten.
- `index.ts`, `commands/answer-ask.ts`, `instructions/respond.ts`: import path only.
- Test `conversation-answer-pin.test.ts` renamed `panel-command-pin.test.ts`. The wrong-PIN permission and parked-choice tests became "settles with no PIN" tests (permission send_or_publish and move_money; choice with delete). The panel-command test is kept and extended (wrong, missing, right PIN). The "already settled replays" test now uses a panel command. Paired, refusal and no-act tests unchanged.

Web (`apps/web`)
- `conversation/thread/answers.ts`: `conversationAskTakesPin` is true only for `panel-command.` asks naming a gated class, so the shared widget's ask port (`present-ask.ts`) sets no `reauthorize` on any other ask. The `ui-components` ask machinery is unchanged: it only opens the dialog when a host action carries `reauthorize`, so no edit was needed there.
- Tests updated: `present-ask.test.ts`, `thread-model.test.ts` (the matrix now also asserts Core is false for every non-panel-command ask; a typo-level fix dropped `parks` from the Core call because the type no longer has it).
- `e2e/chat-widget.spec.ts`: the two PIN-dialog tests became one-press tests that expect no dialog. Not run.

Docs: `client-gateway.md` bullet near line 465 and the unreleased entry in `package-boundaries.md` rewritten.

## Commands run and observed results
- Before the Core change to the decision: with the old logic temporarily restored, `vitest run .../conversation-answer-pin.test.ts` -> 2 failed, 5 passed (the two new no-PIN tests failed with "PIN is required for this action"). Then restored.
- packages/fluxiq: `pnpm.cmd exec vitest run src/runtime/conversations src/programs/automation-studio/api --minWorkers 1 --maxWorkers 2 --reporter=dot` -> 60 files, 487 tests passed.
- packages/ui-components: `vitest run src/chat ...` -> 80 files, 524 tests passed. `pnpm.cmd --filter @fluxiq/ui-components check` -> built, no errors.
- Rebuilt Core dist (`pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/ui-components build`), needed because the web tests refuse a stale build.
- apps/web: `npx tsc --noEmit` -> no output. `vitest run src/features/chat-widget src/features/automation-studio/conversation ...` -> first run 1 failed (a `confirm`+delete test expected `destructive: true` on a non-panel ask), fixed, rerun 31 files, 271 tests passed.
- `pnpm.cmd --filter fluxiq check` -> passed (no output errors). `node scripts/structure-audit.mjs` -> "passed (487 warning(s), 1097 baselined)".
- Search: in `runtime/conversations` and the `answer-ask` path, `authorizationPin` is read only by `authorizeAnswer` in `handlers/conversations.ts`, which returns early unless `automationStudioPanelCommandAnswerNeedsPin` (panel-command only).

## Not verified
- `apps/web/e2e/chat-widget.spec.ts` (not run, per brief). No browser, Lab or panel.
- Whether `.structure-baseline.json` needs an entry for the renamed files; the audit passed.

## Open questions or contradictions found
- `runtime/conversations/commands/answer-ask.ts` still refuses a typed "yes" to any ask naming delete, money or send/publish, with the words "confirmed with your PIN on the question itself, not by typing". `commands/tests/execute.test.ts` asserts this ("never grants a delete by typing", and the summary contains "PIN"). It is a separate rule from the removed check, and removing it would weaken that test, so I left it. It now points to a PIN the question no longer takes for non-panel asks. The user should decide whether a typed yes should settle those asks (then the guard and its wording go) or stay refused (then the wording should stop naming a PIN).
- Files are renamed by plain move, not `git mv` (hook); the lead should stage the deletion of `answer-pin.ts` and `conversation-answer-pin.test.ts`.
