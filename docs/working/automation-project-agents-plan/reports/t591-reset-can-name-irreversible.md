# t591 reset-can-name-irreversible: worker report

## Outcome

Done. All four parts of the brief are in, tests cover each of them, typecheck is clean, the four named test sets pass, and the structure audit passes.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

1. **`cannotUndo` on a reset's completion** (social debug fix 2).
   - `project-agents/dispatch/reset-loop.ts`: the completion schema gains `cannotUndo`, an array of `act-N` ids with a description of when to use it. `checkCompletion` reads `result.cannotUndo` (strings only) and passes it to `remainingActs(cannotUndo)`. The refusal instruction now ends: "If the site offers no control on an act's own item that reverses it, do not keep trying: complete and name that act under cannotUndo, and it is kept as done." The header says why.
   - `service/project-build/brief-ports.ts`: the reset port's `remainingActs(cannotUndo)` sends the ids to each owner ledger's `beforeTrial(checks, cannotUndo)`. The ledger keeps an act only if it was already asked for (`askedFor > 0`). That is the existing behaviour at `ledger.ts:287-291`, unchanged. The second copy of the schema (`RESET_COMPLETION`, which the decisions are asked under) now matches the loop's copy.
   - I also added one sentence to `RESET_TASK`, the reset's own instruction from its first decision, saying when to use `cannotUndo`. The brief says "its instruction says when to use it". This is slightly outside the literal "only the reset's tool schema and outside-brief note"; see Open questions.
   - `project-agents/dispatch/types.ts` (not in the owned list, and not forbidden): `AutomationStudioProjectResetPorts.remainingActs` now takes an optional `cannotUndo`. Without that, the ids cannot reach the port. `run-brief.ts` is unchanged: its default `remainingActs` and its no-argument calls still type-check, and they ignore the new argument.
   - `flow-bootstrap/site-reset/ledger.ts` needed no change.
2. **No `write` on a reset's `core.run_node`.** In `brief-ports.ts`, `withoutWrite(tool)` drops `AUTOMATION_STUDIO_NODE_WRITE_KEY` from the run-node tool's input schema, and the reset port applies it after `automationStudioSiteResetUndoesTool`. A builder's tool is untouched.
3. **A lasting press in a reset that names no act is flagged as outside the brief.** No new refusal was added.
   - `told(...)` takes `role: "reset"`, and the reset loop is now wrapped in it with `entry: undefined` and `arrived: false`.
   - In a reset, a call carrying `undoes` is never flagged.
   - Any other landed lasting call gets `outsideBrief: { consequences, note }`, worded for a reset: it ran, it stays on the site as the build's act, it is listed with the acts to undo where the site can undo it, and the reset should only undo the listed acts.
   - The builder's note is byte-identical.
4. **Refusals worded for the role.**
   - `flow-bootstrap/site-reset/words.ts`: `wrongTarget(role?: "reset")`. With no argument the text is byte-identical, pinned in a new test. The reset version says the act is kept, then "Undo another listed act on its own item with "undoes", or, when no listed act has a control on its own item that reverses it, complete and name those acts under cannotUndo." It does not mention a test or a revision.
   - The ledger does not know whether it is answering a reset, because the act's owner is a builder's ledger. So the reset port wraps `calls.target` (`resetWorded`) and replaces the instruction only on `candidate.undo_wrong_target`.
   - `llm/repeat-guard/feedback.ts`: a new `undrafted` flag on `automationStudioLlmEvidenceRepeatRefusalNote`. When it is set:
     - " end this round, and the Flow so far is then tested and judged." becomes " end this work where it stands, with nothing tested or judged.", the wording `refusal-run.ts` already uses for loops that write no draft.
     - The two "amend the draft" alternatives are removed. Such a loop has no draft. This goes a little beyond the one sentence the brief named; see Open questions.
     - Candidate notes ignore the flag (byte-identical). Without the flag, all text is unchanged.
   - `llm/decision-handlers/refused-repeat.ts` passes `undrafted: !candidate && context.input.draft === false`.
   - `amendment.ts`'s caller is unchanged. It runs only in loops that write a draft.

New and extended tests:
- `service/project-build/tests/project-build-reset.test.ts`: `cartBuild` takes a reset script, and two new cases cover a reset brief.
  - Case 1 checks that:
    - the reset's run-node tool has `undoes` and no `write`, while the builder's still has `write`;
    - the completion schema has `cannotUndo`;
    - a reset's own Add to cart runs and is flagged `outsideBrief` with the reset wording;
    - the first completion is refused with `project.reset_acts_in_place`;
    - the second completion's `cannotUndo: ["act-1","act-2"]` reaches `AutomationStudioSiteResetLedger.prototype.beforeTrial` (checked with a spy);
    - the dispatch returns `done` with `lastingActsInPlace: 0`, and both lines are still in the cart (kept, not undone).
  - Case 2: an undo aimed at the dish-soap line is refused `candidate.undo_wrong_target` with exactly `wrongTarget("reset")`, nothing is removed, and the reset returns `done`.
- `project-agents/dispatch/tests/brief-loops.test.ts`: two cases.
  - The ids a completion names under `cannotUndo` reach `remainingActs`, and the reset ends `done`.
  - The refusal says "complete and name that act under cannotUndo".
- `flow-bootstrap/site-reset/tests/words.test.ts` (new): the candidate's `wrongTarget()` is pinned byte for byte; the reset wording is checked.
- `llm/repeat-guard/tests/feedback.test.ts`: two cases.
  - With `undrafted` set, all four note kinds end "with nothing tested or judged" and never mention the Flow so far or amending a draft.
  - Notes without the flag are unchanged, and candidate notes come out identical whether or not the flag is set.

## Commands run and observed results

All were run in `C:/Users/osrs_/FluxStuff/fxwork/t591/!FluxIQ`.

- `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`) printed `tsc exit 0` with no output. An earlier run caught a type error in my own test (`completionSchema` is not passed to `decide`), and I fixed it.
- `npx vitest run <runtime>/project-agents <runtime>/service/project-build <runtime>/flow-bootstrap/site-reset <runtime>/llm <runtime>/flow-bootstrap/tests/site-reset` printed `Test Files 247 passed (247)` and `Tests 2332 passed (2332)`. That run includes the existing candidate pins: `candidate-feedback`, `candidate-repeat-fix`, `refusal-run-wording` and `site-reset-build`.
- `node scripts/structure-audit.mjs` printed `structure-audit: passed (357 warning(s), 1156 baselined)`.
- Mutation check: I temporarily dropped `cannotUndo` from brief-ports' `remainingActs(...)` call. The new service case then failed ("expected false to be true" on the spy assertion). I restored the file and confirmed the line is back.

## Not verified

- No live run and no provider call, as the brief requires. Whether a real model uses `cannotUndo` well is untested.
- The full package suites and `pnpm check` were not run (narrow checks only, per the rules).
- The default `remainingActs` in `run-brief.ts`, used only when a port supplies none, ignores `cannotUndo`. The service always supplies one.

## Open questions or contradictions found

- **Edits outside the literal owned scope:**
  - `project-agents/dispatch/types.ts` (one type widened). It is needed for the routing.
  - One sentence added to `RESET_TASK` in `brief-ports.ts`.
  - The wrapper `resetWorded` on the reset port's `calls.target`, also in `brief-ports.ts`. It is the only place that knows the caller is a reset.
  - The two "amend the draft" removals in undrafted repeat notes.
- **`brief-ports.ts` is now 432 lines**, past the 400-line advisory threshold. It is a warning only, and the audit passes. The reset helpers (`withoutWrite`, `resetWorded`, the reset branch of `told`) could move to a module of their own in `service/project-build/`. That file is not in my owned paths.
- **`cannotUndo` is honoured only once an act has been asked for**, following the brief and the ledger's rule. A reset that names an act on its first completion is refused once, and is kept on the next completion. In a reset the acts are already listed from the first decision (t585), so treating that listing as "asked" would save one round. It would need a ledger option. I did not build it.
- **With a single act, `cannotUndo` changes nothing visible:** the ledger's existing stall rule (an unchanged refusal is admitted) would also keep the act on the second completion. `cannotUndo` matters when other acts are still in place, or when the refusal signature changes. The service test checks the routing with a spy, not by outcome.
- **Other reset-facing words still name the candidate's test tool**, for example `unknownAct` ("that core.test_candidate listed"). They are out of this brief's scope.
