# t647 report: a trial on a page the exploration changed, and no step does

## Outcome

Done. Both trial gates now add a Core-measured finding, `trial.explored_on_absorbed_act`, to a trial's feedback under
`coreFindings`. This covers the subflow gate and the whole-candidate gate; the whole-candidate gate has the same gap, and
it is closed there too. Nothing was committed.

## What changed and why

The rule is in `flow-bootstrap/site-reset/explored-on-absorbed.ts` (new, exported from the barrel). It reads the acts
this trial's start reset took back (`absorbedByStartReset`). An act counts only when all of these hold:

- the act log says an exploration call made it (`call` is present, so a trial's own act never counts);
- in the subflow gate, this brief's ledger recorded it (`owner` equals `scope.briefId`);
- the gate carried a name for its control (`control`).

It then checks the act against the Flow's steps. Any step whose label, or any word-bearing field of its
`element`/`target`/`target.fingerprint` (accessibleName, visibleText, label, placeholder, and a flat target's name),
names that control counts as doing it. So does any act the trial itself landed (`answer.acts`, which includes the
predecessors' acts), by its label or control words. Words are compared ignoring case, spacing and quotes, as equal text
or as a whole phrase inside the other. "Hold" never matches "Holdings". Any step that names the control counts as doing
the act, whatever else it does. A finding is therefore never said of an act that a step might perform. A finding is:

```
{ code: "trial.explored_on_absorbed_act", act, did, call?, said }
```

`said` names the act as the act log records it, and says that the page explored after it was changed by an act this
trial's start undid and that no step does. The wording is generic, and at most 10 findings are given per trial.

- **The act log** is in `site-reset/ledger.ts` and `site-reset/contracts.ts`. An explored act now keeps its control's
  name (`declared.control.name`, which the gate carried). Absorbed entries carry `owner` (the ledger's owner option,
  meaning a project brief) and `control`. These two fields use a new type, `AutomationStudioSiteResetAbsorbedAct`, which
  the decision's `absorbedByStartReset` now uses. Neither field reaches a model: both gates already map absorbed acts
  through their own `namedAct`, which keeps only `act`, `did` and `call`. Phase-start maps them to `{ act, did }`.
  `inPlace` and the refusal lists are unchanged.
- **Subflow gate** (`subflow-candidate/subflow-trial-gate.ts`): the finding is added only when the verdict is not yes
  and `entryPrepared` is true. When the entry was not prepared, the predecessors did not all run, so what they do was
  not measured. The finding goes on `answer.feedback` before `port.weighed` is told. That puts it in the kept verdict
  (`standing`), the dispatcher's weighed answer, `closedDigests`/`previousFeedback` and the completion refusal's
  `trialFeedback`.
- **Whole-candidate gate** (`candidate/trial-gate.ts`): the same gap exists here, so the finding is added there too.
  It applies to any trial that is not a yes, against every node of `latest.buildPlan.plan.subflows` plus the trial's
  landed acts. There is no owner filter, because in the whole Flow any exploration of the build counts; under the
  project supervisor's whole trial, that means every brief's exploration.
- **Tests:**
  - `site-reset/tests/ledger.test.ts`: 6 `toEqual` expectations on absorbed acts now include `control: "Save"`.
  - New `site-reset/tests/explored-on-absorbed.test.ts`.
  - New `subflow-candidate/tests/subflow-trial-explored-on-absorbed.test.ts`. This uses a real project ledger and the
    real project reset.
  - New `candidate/tests/trial-gate-explored-on-absorbed.test.ts`.
  - All fixtures come from a library site (a "Make this my home branch" button and "Renew all").

## Commands run and observed results

All commands ran in `C:/Users/osrs_/FluxStuff/fxwork/t647/!FluxIQ`:

- `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq`: no output, exit 0 after the test typing fixes. The first
  run reported only type errors in the new tests (`evidence` is a `JsonValue`, plus `exactOptionalPropertyTypes`).
  Those are fixed.
- `npx vitest run` on `runtime/flow-bootstrap/site-reset`, `runtime/flow-bootstrap/subflow-candidate`,
  `runtime/flow-bootstrap/candidate/tests/trial-gate`, `runtime/service/subflow-trial` and
  `runtime/service/candidate-trial`: 52 files, 393 tests passed.
- `npx vitest run` on `runtime/flow-bootstrap` (all of it), plus the consumers of absorbed acts
  (`service/project-build/tests/project-build-phase-start.test.ts`,
  `service/project-build/tests/project-build-brief-ports.test.ts` and
  `project-agents/supervisor/tests/whole-trial.test.ts`): 175 files passed and 1 skipped; 2208 tests passed and 2
  skipped.
- After the typing fixes, the 3 new test files were run again: 9 tests passed.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (378 warning(s), 1156 baselined).`

## Not verified

- No live run.
- Whether a declared control name and a saved step's words agree on a real site. Matching is by words only. If the two
  wordings differ completely, a false finding is possible. The opposite failure, a missed finding, is the deliberate
  bias.
- A predecessor step that did the act but did not land in the trial does not count as doing it, because it was `stateHeld`
  or declared nothing lasting. An accepted predecessor's proposal itself is not visible to the subflow gate, and its
  port is not mine to change. So the "predecessor performs it" check reads the trial's landed acts only.
- The whole Core suite was not run.

## Open questions or contradictions found

- **The builder's return drops the finding.** `project-agents/dispatch/ending.ts`, `trialSaid` (around lines 302-318),
  words the last trial as only the feedback `code`, the failed step, or `judge.observed`/`judge.advice`/`why`. It never
  reads `feedback.coreFindings`. Receipts (`project-agents/dispatch/receipts.ts`) carry only the verdict and rows. So
  the supervisor does not get the line verbatim, and adding it needs an edit to `trialSaid`, which I did not make. The
  finding does reach the builder: it is in the trial evidence's `feedback` and in the completion refusal's
  `trialFeedback`.
- The feedback key is `coreFindings`, kept separate from the judge's `findings` (string list). The supervisor may want a
  different name.
