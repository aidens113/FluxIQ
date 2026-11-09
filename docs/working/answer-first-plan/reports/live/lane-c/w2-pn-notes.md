# w2-pn-notes: second attempt at professional-network-accept-messaged-invitations

## Outcome
Done. The fixture now leaves the accepted people's notes on the site, and the provider-free two-attempt Lab run exits 0 with both attempts right.

## What changed and why
Fixture (`apps/scenario-lab/src/scenarios/professional-network/`):
- New `conversations/` directory (`accepted-people.ts`, `thread-list.ts`, `index.ts`). Accepting a person-kind invitation lists the person in Connections as recently added (last accepted first). If the invitation carried a note, it also starts a conversation whose message is the note exactly as written. Both are derived from `state.accepted`, so there is no new state and the oracle and store are unchanged. An invitation without a note only adds the connection. Page and newsletter invitations add neither.
- Messaging page (`pages/simple-pages.ts`) and the docked list (`shell/overlays.ts`) render `threadRows(state)`: newest message first, with a date on every row. The four earlier threads keep their texts and dates.
- New conversations are tagged "New connection".
- New Connections page at `mynetwork/invite-connect/connections/` (`network/connections-page.ts`), reached from the "Connections" entries in both rails. The connection count (612 baseline) is now `connectionCount(state)` = 612 + accepted people, in the rails, the page heading and `in/me/`.
- `ThreadRow` type added to `types.ts`. `network/index.ts` and `route.ts` export and route the new page.
- Not touched: `live-tasks.ts`, the qualification file, the other scenarios, and the Lab files outside my paths.

How a person recovers "the order the invitations list shows them": each new conversation is dated the day its invitation was sent (Sep 21, Sep 15, Sep 5), and Messaging lists newest first. That puts Ximena Ruiz, Lucia Romano, Chidi Nwosu in the invitations list's own order. The "New connection" tag picks those rows out of the seven. Connections shows the same three, but recently-added order is reverse acceptance order (so Chidi first if accepted in list order). The note is read from Messaging, not from Connections.

Script (`packages/test-runner/src/attempt-lane/scripted-model/scripts/professional-network-accept-messaged-invitations.ts`):
- New form `notes-back`. Attempt 1 is the plain accept path. Attempt 2 presses nothing: it opens Messaging, detects the conversation rows, and reads name and message where the tag field contains "New connection". Fields come off the detected structure: the tag by its sample, the name by its key, and the message as the longest field that does not also contain the name (that excludes the whole-row field). No names or notes are hard-coded.
- `panel_command` has two replies in this form. `loop_verification` has three replies that judge by the summary's `totalRecordCount`.
- Why the judge: when attempt 2 replays the saved Flow, nothing is left to accept, so its read returns 0 rows. With the old always-yes judge, Core ended attempt 2 "achieved" with no rows (first probe). Judging "no" on 0 rows sends Core into its evidence loop, where the new decision path reads the notes.
- Attempt 2 is told apart from attempt 1 by the page: a manager or My Network page with no Ximena row and no structure detected yet. After that it is sticky, via `back-` call ids.
- Tests added to `scripts/tests/professional-network-accept-messaged-invitations.test.ts`.

Tests added: `tests/accepted-conversations.test.ts`, four browser tests:
1. Attempt 2 reads the three people and notes from Messaging in the right order and dates, with the tag only on those three and 7 conversations in all, and the store is unchanged by reading.
2. Connections lists exactly the three, recently added first, with count 615.
3. Before any accept there are 4 conversations and no connections.
4. After attempt 1, neither the manager nor My Network lists the accepted rows. A repeat `accept-invitation` post leaves the store, the conversations and the connections unchanged.

## Commands run and observed results
- `pnpm --filter @fluxiq-web-extension/scenario-lab build` -> built. `node --test` over every `dist/scenarios/professional-network/**/*.test.js` -> `# tests 47 # pass 47 # fail 0`. This includes the existing `breadth-paths.test.ts` accept tests and the four new tests.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (244 warning(s), 552 baselined)`. It first failed on an import that skipped a barrel (`../network/connection-count.js`); I fixed that.
- `packages/test-runner`: `pnpm check` (tsc --noEmit) passed. `pnpm build`, then `node --test` on the script test -> `# tests 10 # pass 10 # fail 0`.
- Lab, as briefed: `FLUXIQ_LAB_INSTANCE=t877-w2 FLUXIQ_TEST_ENV_FILES=none FLUXIQ_PROVIDER_KEY_FILES=none FLUXIQ_ATTEMPT_SCRIPT_FORM=notes-back pnpm lab attempt professional-network --task professional-network-accept-messaged-invitations --authoring-mode answer-first --scripted-model --attempts 2` -> exit 0, `{"status":"passed","answerVerdict":"right","attempts":[{"attempt":1,"answerVerdict":"right","path":"explore","calls":12},{"attempt":2,"answerVerdict":"right","path":"run_flow_then_explore","calls":6}],"secondStartedFromFirst":true,"reseededBetween":false}`. Evidence is in `test-runs/instances/t877-w2/attempts/run-mw44x3l7-0531d6ad`. Attempt 2 reported "It changed nothing on the site", with 3 rows stored and 3 shown.
- Earlier probes for the record:
  - Probe 1: attempt 2's `loop_verification` had no reply, so the script was refused.
  - Probe 2: the judge always said yes, so attempt 2 ended "achieved" with 0 rows and was wrong.
  - Probe 3: the message column picked the whole-row text, so attempt 2 was wrong.
  - Probe 4: passed.

## Not verified
- The Lab run was last done before the final edit to the script's test file. The script logic and fixture were not changed after it.
- The plain, reshape and thin forms were unit-tested only, not re-run in the Lab. Their reply lists are unchanged.
- Accepting does not change a member's search degree (still second-degree in people search within the same session). No task searches again after accepting.
- Not run: the other scenarios' tests and the full workspace suites (not asked).

## Open questions or contradictions found
- Core's second attempt replays the saved Flow and asks `loop_verification` before any evidence decision. The form depends on the judge answering "no" for an empty read. If the live judge says yes for an empty table, attempt 2 ends with no rows. That is an attempt-lane or Core matter and I did not touch it.
- `scripted-model/scripts/index.ts` was not changed. The form is selected by `FLUXIQ_ATTEMPT_SCRIPT_FORM=notes-back`.
- `pnpm lab` runs a roughly 10-minute build prelude after any source change.
