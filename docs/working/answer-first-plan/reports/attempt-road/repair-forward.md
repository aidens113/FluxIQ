# A forward run that stopped at the first row (t869)

## Outcome

**Done, up to the browser proof, which is yours to run.** The fix is in, the provider-free proofs pass, and with the fix taken out proof 1 fails the way the paid run did: no other row was reached.

The cause was not the one the brief guessed. The run never stopped at a row, because it never ran a row at all. Both forward runs in the paid run went straight through the steps once, with no row. Two separate defects each caused that.

## The draft as the model wrote it

Paid run `run-mw37vz9n-a77a02c2`, read from steps 52 to 70.

| Step | What it is | How it got there |
| --- | --- | --- |
| 17 | `web.output.dom-extract_list`: title, price, link; three `where` conditions; **`dedupe: true`**; `recordOutput` `candidates` with **`purpose: "intermediate"`** | Read by hand at step 53, then added |
| 23 | `web.output.dom-click` on the first card, `consequences: []` | By hand at step 57 |
| 24 | `web.output.dom-check`, `{ target: t1144, checked: true }`, `consequences: ["modify_existing"]`, `write: true` | Written at step 59, while the page showed `button "Saved" pressed` |
| 25 | `web.output.browser-navigate` to the sorted search address | Moved after 24 at step 60 |
| 23 to 25 | `{ step: 23, change: "repeat", over: 17, through: 25, most: 3 }` | Step 62 |
| 26, 28 | Navigate to `/saved/`, then read the saved items | Steps 65 and 69 |

The brief calls the Save step `ensureState`. It is really the `web.dom.check` verb. `apps/extension/src/content/actions/check.ts` presses nothing when the page already shows the state (`aria-pressed` here).

## The cause

Both runs' call ids prove it: `run_forward_1.23` and `run_forward_2.23`, never `.pass.N`, and no call carried an `item`.

1. **First run, `{from: 23}`, page on `/saved/`.** The repeat's list, step 17, was outside the range. `S/runtime/llm/node-tools/replay/span.ts:243-245` (at the branch commit) looks for the list only among the steps being run, finds nothing and plans no loop. The walker then sent each step once, on no row.
2. **Second run, `{from: 17, to: 28}`, page on the list.** The list was in range and answered "kept 6 rows", but with no `outputs.records`, so `span.ts:254-255` again planned no loop.
   - The rows come from `domain/.../node-run/replay-answer.ts:400-401`, which asks the Flow's dispatch. That dispatch refuses `dedupe` on an intermediate record output, which is `record_output.intermediate_process_unsupported` in `output-nodes/extract-list/dispatch.ts`.
   - I ran the dispatch on the paid run's exact parameters. As written with its handle it passes. In its resolved form it answers `ok: false` with that code. Without `dedupe` it passes.
   - By-hand runs and replays both skip that check, because `gatedByCaller` turns off `webPlanUndispatchable`. So the model was never told.
3. **Why the rest looked like the brief's shape.**
   - Step 23 was refused `attempt.act_already_done`: with no row, its foreseen words named the first table, and that row already held Save.
   - Step 24 then found no Save control, because the open never ran (`target_not_found`).
   - Both were excused as steps the Flow does not always run, so the answer said `passed: true`. The model only learned otherwise from the saved page.

## The rule now

The full rule is in `S/runtime/llm/node-tools/replay/forward.ts`.

- **A forward run takes the whole repeat and its list, whatever range it was asked for** (`replay/forward-range.ts`). A range starting inside a repeat starts at its first step. A list before the range is read just before the repeat, on its own page.
- **A row already done sends nothing.** The pass is skipped at its start, as it already was. If the record only refuses it partway, the pass closes there, comes back by its own later steps, counts as skipped, and is never named as not done.
- **A failing step on a row ends that pass only.**
  - Nothing lasting is sent for that row afterwards, its later steps that declare nothing still run, and the next row goes on.
  - The row goes in `rowsNotDone`. A row whose own control was never found still says "nothing was done to them". Any other failure is worded apart (`rowsStepFailed`), because something may have been done to it.
  - A row whose lasting step landed and whose way back alone failed is done, and is not named.
- **How the next pass reaches the list.**
  - First choice: the loop's own way back, when the last pass ran it and it worked.
  - Otherwise the pass's first step goes out with `reach: true`, and the host moves to that step's recorded address if the page is not already there (`domain/.../node-run/reach-page/`).
  - That is a navigation only: no reset, nothing lasting, and put to the same gate. `call-chain.ts` still refuses `replay: "reset"`.
  - A repeat of one step never asks. A step that moves the page itself, such as a `$row` navigation, is not moved first.
- **A repeat with no rows sends nothing of itself.** The run stops at its first step and the answer says the list gave no rows. A lasting step with no row would act on whatever page stood there. This is a tool answer, never a task ending. A repeat over a check that does not hold runs zero times and the run goes on.
- **A read a Flow would refuse is told where it is written.** A by-hand or written read is refused with the dispatch's codes, and a replayed one answers `core.replay.failed` saying why, without reading (`node-run/list-read/flow-refused.ts`). This costs a model one call at the point it writes the read. Without it, a re-run of this model would reach the same empty loop.

No new way for a task to end was added, and nothing lasting is ever sent twice. Docs updated: Core `docs/architecture/automation-studio/llm-flow-bootstrap.md`, Extension `docs/architecture/build-loop.md`.

## Browser proof to run

After the rebuild, nothing else needed:

```powershell
# Core worktree
pnpm.cmd --filter fluxiq build
# Extension worktree
pnpm.cmd --filter @fluxiq-web-extension/domain build
pnpm.cmd --filter @fluxiq-web-extension/test-contracts build
pnpm.cmd --filter @fluxiq-web-extension/test-runner build
$env:FLUXIQ_ATTEMPT_SCRIPT_FORM='open-save-back'; pnpm lab attempt local-classifieds --task local-classifieds-save-dining-tables --authoring-mode answer-first --scripted-model
```

Expect exit 0, and in the evidence:

- `read-deduped` refused, naming `record_output.intermediate_process_unsupported`.
- `forward.<read>` carrying `reach: true`.
- Passes `.pass.2` and `.pass.3` and no `.pass.1`.
- `Rows: 2 done, 1 skipped as already done, 0 failed`.
- `site.json` saving pine, glass and industrial once each, with no "unsaved".

The script throws if the forward run does not pass.

The form does what the model did, in its order: opens and saves the first table by hand, comes back, reads (first with the refused `dedupe`, then without), opens again, writes the Save as `dom-check` with `checked: true` while it shows "Saved", repeats over the first three rows, goes to `/saved/`, and asks for `{from: <open>}`.

## Commands run and observed results

| Command | Observed |
| --- | --- |
| Acceptance list from `packages/fluxiq`, `--minWorkers 1 --maxWorkers 2`, plus `tests/forward-loop.test.ts` | `Test Files 27 passed (27)`, `Tests 435 passed (435)` |
| `vitest run src/framework/automation-service/service/answer-first src/runtime/llm/node-tools` (run before the last two small edits: a gate test added and a comment) | `Test Files 98 passed (98)`, `Tests 949 passed (949)` |
| Proof 1 with the walker's fix out of `draft.ts` | `expected [] to deeply equal [ 'Birds of the Coast', 'Clockmaking' ]`: no other row reached |
| Restored | `cmp` silent, md5 `0f658004681db8874f5e00282b5e875a` before and after |
| `pnpm.cmd --filter fluxiq check` | `"build-cache":"build"`, exit 0 |
| `node scripts/structure-audit.mjs`, Core | `passed (526 warning(s), 1097 baselined)` |
| `node scripts/structure-audit.mjs`, Extension | `passed (243 warning(s), 552 baselined)` |
| `DOMAIN_TEST_BUILD_LABEL=repair-forward node scripts/test-domain.mjs node-run/ output-nodes/extract-list` | `# tests 637`, `# pass 637`, `# fail 0` |
| `tsc -p tsconfig.json --noEmit`, test-runner and domain; `tsc -p tsconfig.test.json --noEmit`, domain | exit 0 each |
| The script's unit test, bundled from source to my scratchpad (no `dist` touched) | `# tests 12`, `# pass 12`, `# fail 0` |

New proofs:

- `SVC/answer-first/tests/forward-loop.test.ts`: six cases through the real service. Proofs 1 and 2 are here, along with a way back that fails, a list with no rows, and a list that cannot be read.
- `run/tests/forward-run-reach.test.ts`: 18 cases.
- `node-run/reach-page/tests/reach-page.test.ts`, `node-run/list-read/tests/flow-refused.test.ts`, and a case in `node-run/tests/run.test.ts`.

## Not verified

- **Nothing here ran in a browser.** The first thing to watch: the Save step recorded the control named "Saved", and on rows 2 and 3 it reads "Save". It should resolve by its test id, but I read `identity/veto.ts` only partly and did not run it. If the veto refuses, the browser proof names those rows as not done rather than pressing anything, and that is where to look next.
- The real `core.run_flow` against a real `dom-check`, and `readChosenState` on this site's button, were read and not exercised.
- A real saved Flow's run is unchanged by this work: `run-gate.ts` was read and not edited, so a failing row there still fails that step as before.

## Open questions and contradictions

1. **"Every existing proof stays right" against the new rule.** Two proofs asserted the old rule directly, so I changed them to the rule you stated: "every other failure of a pass still stops the run there" and "stops at a failing pass". "The page a forward run's answer holds ... a run that stopped" now stops at the list, because a pass no longer stops a run. All other existing proofs are untouched.
2. **"Must not touch guidance."** I changed `FORWARD_DESCRIPTION` in `run/flow.ts`, which the model reads, because its sentence "any other step that does not pass stops the run" would now be false. It names no site and no task. Revert it if you read "guidance" as covering it.
3. **A slow case I left alone.** A row whose target is missing waits about 23 s (step 72 did), so a loop wrong on every row costs 23 s per row in wall clock, with no model calls. Your rule says the rest still run, so I added no early stop.
4. **For `repair-saved`.** The plan's submit check refuses the same `dedupe` plus intermediate read (`webPlanUndispatchable`). That may be one reason this run ended "Nothing saved". I did not test it. With the read now refused when it is written, a fresh model cannot reach that state.
