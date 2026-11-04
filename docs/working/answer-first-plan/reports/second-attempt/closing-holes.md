# Closing the two repeat-press holes on the second attempt path (t870)

## Outcome

Done, provider-free. Both holes are closed as asked, and the note is reworded. Some forms stay open and some new wrong refusals exist; both are listed below and pinned by "known limit" tests. Three things differ from the brief or were not in it (see "Decisions for the lead").

`AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`. `AR/` = `packages/fluxiq/src/runtime/answer-first/act-record/`.

## The field

```ts
// runtime/llm/harness-options/binding.ts (additive)
describeCall?(input: { projectId: string; flowId: string; toolId: string; value: JsonObject }):
  { target?: string | undefined; text?: string | undefined; wouldRunWith?: JsonObject | undefined } | undefined;
// domain runtime-contract: WebLlmCallWords = { target?: string; text?: string; wouldRunWith?: JsonObject }
```

The domain fills it for a run-node call only, when the handle resolves: the call's own parameters minus the `target`, `element` and `selector` slots, plus the handle's `selector` and `element`, plus the frame when it is not the top one. A domain test on the real runtime holds it deep-equal to the real press's `draft.ranWith.parameters`. A handle that does not resolve leaves it absent, and a lookup that throws reads as unresolved.

In Core: `AR/contracts.ts` adds `AutomationStudioAttemptActForeseen = { words?: string; parameters?: JsonObject }` and `foreseen?` on the call. The chain's `describe` feeds the gate's new `foresee`. A throw or another shape reads as no answer. Nothing sent to a page changes (test: "sends the call as it was written").

## Hole 1: what a press by a handle is now held to

It is read beside the call's own identity, and only ever adds refusals. Tests are in `AR/tests/foreseen.test.ts` and `AF/tests/double-act-on-run.test.ts`.

**Closed:**

| Form | Test |
| --- | --- |
| Row the run pressed, words of the control fit it (the pinned test: Atlas reads 2, was 3) | "by the address it would run with, and the words of its control" |
| The same, words alone | "by the words of its control alone" |
| Control named the same on every row, row's words only inside its fingerprint (the web domain's `element.context.record`) | "by the row's words its fingerprint holds" |
| Act on no row, new handle, same address or same whole fingerprint | "a press by a new handle on a control with no row"; "refuses the same address..." |
| Act on a row, no row words, the very same address | "refuses a control with no row's words at the very address" |
| The row's own page, with the same key or control words | "on the row's own page" |
| May-have-landed, new handle: held to a look | "holds a repeat that may have landed to a look" |
| Press that dies before its answer: next attempt knows it by frozen form and row | "a press that dies before its answer" |

**Stays admitted, on purpose:** a control with no row words on a row not pressed; a row's other control; a press whose words fit another row; the same control on another page; words every row holds (a column repeating the control's name).

**Left open, could still press twice:**

- A control with no row's words and no matching address, on a row the run pressed. Atlas reads 3. Test: "known limit: a control with no row's words and no address". On the web this needs a control whose packet published no record words, or a record keyed by a value no row holds.
- A row's values written differently from the words. Test: "a row's values written otherwise".
- A control whose words changed with the press and whose address counts places. Test: "a control whose words changed".
- A labelled control. `wouldRunWith` is what the resolver writes, and `webLabelledIdentity` thickens the identity only at the press, so the fingerprints differ. By reading; no test.
- `web.recovery.press`: no field, and its action id differs. Test: "only a run-node call says it". I did not check whether this tool is reachable on the attempt path.
- Unchanged and still pinned: a target that says `unacted` for a press that landed, and a step that declared nothing being repeated by the engine.

**New wrong refusals (too little, never twice):**

- Two rows whose words cannot be told apart: the one not pressed is held done, **by hand too**. Test: "known limit, too much: two rows".
- The same whole fingerprint for another item at one address, such as a page that swaps its content without changing path. Test: "known limit, too much: the same whole fingerprint".
- The same control on another page where one of the two pages is unknown, for example an act a Flow's run made. Test: "holds it the same where a page is not known".

In these cases **the rule "a judge's no brings it back by hand" does not hold**: the by-hand press is refused again, so the model must find another way or spend its budget. The brief's rule holds only for a row a forward run left out where the by-hand press's words fit no acted row. See "Decisions for the lead".

## Hole 2: a look lifts a hold only after a refusal

`admit` answering `look_first` is the refusal, and only a look after that opens the act. A new uncertain answer or a `doubted` resets it. A forward run leaves a held row out whatever was looked at. A dead process's record behaves the same.

**After being told and looking, whether to press is still the model's reading, because Core does not read pages.** Test: "known limit: a look after the refusal opens it": refused, shown two, pressed anyway, card reads 3. A model that reads the page and stops presses nothing; the card reads 2.

**Cost:** a refused press and a look. That is two decisions more than a model that would have pressed at once, and one more than a model that looks first. The brief expected one. It applies only to an act in doubt.

## What a model and a person see

- **Model, refusal:** the same words as before, plus `diagnostics: { resend: "accepted_once" }` in its evidence.
- **Model, act rule (`forModel`):** "Look at the page for one that may have landed: if its effect is there, it is done. A first try at it again is refused and says to look, and only a look after that lets it go."
- **Model, note after a failed saved step:** "...Fix that step, then run forward. Running a saved step again only checks it when it acts lastingly, and does nothing: if it has to change, write the changed step as a new step, drop the old one, and then run forward." Test: `attempt/tests/round-note.test.ts`, including that it names no site or tool.
- **Person:** no new wording of mine. I did not check how the chat shows a refused press.
- **Not touched:** `runtime/answer-first/guidance/guidance.ts` still says "looked for first", which is still true but says nothing of the first refusal.

## Decisions for the lead

1. **The repeat guard would have made hole 2's fix a dead end, so the refusal now invites one resend.** The loop refused the identical press after refuse-then-look on an unchanged page (`llm_evidence_loop.repeat_refused`), so a press that truly had not landed could never go. I used the existing `diagnostics.resend` mark. Limit, by reading, untested: press, press again without looking, look, press is still refused on an unchanged page. That is the safe side.
2. **Who was refused is kept in memory, not persisted, so `data()` is unchanged and still round-trips.** The brief allowed this if I said why. A restart between the refusal and the look re-refuses once and sends nothing. Persisting it would let a carried-on round's automatic opening look open the act for a model that never saw a refusal, which is this hole again. Left open: a new round in the same process after a refusal, and a look that already opened an act surviving a carry-on. In both, the next model can press after its opening look. Only the second is pinned, by "a look that did open it stands across a restart"; the first is by reading.
3. **Beyond the brief, needed for the live shape:**
   - The sentence also takes every word in the frozen fingerprint at any depth (`says`). A web row control's name is usually just "Renew", and its row's words are in `element.context.record`; without this the live shape stays admitted.
   - A whole fingerprint does not refuse against an act on a row, because every row's control has it.
   - A page guard: `placePath` is now kept on every act. Without it, "Add" on two items' pages would refuse the second for ever. A domain test holds that a real press's answer carries `evidence.location`.
   - **Your call:** if holding a row done by hand is too strong for look-alike rows, it is one line in `AR/record.ts`, `matchesForeseen`. Loosening it trades a stall for a possible double press, so I left it on the side of no double press.

Also found: `runtime/automation-activity/observer.ts` `describeSafely` has no try, so a `describeCall` that throws fails there, outside my paths. By reading, and consistent with a service-level test of a throw that did not press. I removed that test; the chain's own guard is tested in `attempt/tests/foreseen-in-chain.test.ts`, and the domain no longer throws from a lookup.

## Mutations

Each was applied by script, run against `foreseen`, `look-after-refusal`, `foreseen-in-chain` and `double-act-on-run` (69 tests then), and restored. The script compares each file with its original after restoring, and it printed `restored`.

| Mutation | Tests failing |
| --- | --- |
| 1. The gate reads nothing the domain says | 5 |
| 1a. Words off | 9 |
| 1b. Frozen form off | 13 |
| 1c. No page guard | 1 |
| 1d. A whole fingerprint counts on rows | 1 |
| 1e. Words every row holds name them all | 1 |
| 2. Any look lifts a hold | 11 |
| 2a. No resend invitation | 4 |

## Commands and observed output

Core, from `packages/fluxiq`:

- The brief's vitest command -> exit 0, `Test Files 18 passed (18)`, `Tests 326 passed (326)`.
- Neighbours: `attempt/tests`, `second-attempt-proof`, `endings/tests/steps`, `flow-run`, `automation-activity/tests/observer` -> exit 0, `Test Files 12 passed (12)`, `Tests 110 passed (110)`.

Core, from the worktree root:

- `pnpm.cmd --filter fluxiq check` -> exit 0, 0 `error TS`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (502 warning(s), 1097 baselined).`
- `pnpm.cmd --filter fluxiq build` -> exit 0. The domain check then refused it as stale, so I ran its named command: `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0. The build includes the other worker's in-progress files.

Extension:

- `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> exit 0, 0 `error TS`, `core-build: ... is current with its source.`
- From `domain`: `DOMAIN_TEST_BUILD_LABEL=t870-closing node scripts/test-domain.mjs node-run/tests/call-words node-run/tests/shown-handle-past-cap` -> `# tests 16`, `# pass 16`, `# fail 0`. This run preceded the check above; no domain file changed between them.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (235 warning(s), 553 baselined).`

No failure elsewhere to attribute. I did not run the whole answer-first folder. `plan-step-permission.test.ts` in the Extension shows as modified and is not mine.

**Tests I changed because they pinned the old look rule:** `AR/tests/{begun,seed}.test.ts`, `AF/tests/interrupted.test.ts`, `AF/tests/endings/tests/steps.test.ts`, and four in `double-act-on-run.test.ts`. Each now does refusal, then look, then press. Helpers: `later-attempts.ts` (optional `describe`) and `library-site.ts` (`site.says`).

## What is only scripted

- The model, the judge and the Core fake's `describeCall` are scripts.
- The domain's field is real against the real runtime with a fake gateway, not a browser.
- Core reading a real `element.context.record` is shown with a generic nested shape, not with a real packet through the whole path.
- A real row-bound step's frozen form and its match to a by-hand press were read from code, not observed live.
- No Lab, browser, real site, key or real process kill.

## Open questions or contradictions found

The brief's "a judge's no brings it back by hand" and its "words fit an acted row is held done" conflict for rows that cannot be told apart. See "New wrong refusals" and decision 3.

Report: docs/working/answer-first-plan/reports/second-attempt/closing-holes.md
