# t658 done-part-survives-additive-amend: worker report

Core worktree `fxwork/t658/!FluxIQ`, branch `task/t658-done-part-survives-additive-amend`.
Nothing was committed. The source is the debug of A8 towels run `run-mvac0nmw`,
fixes 1, 2 and 9.

## Outcome

Done. All three fixes are built and tested. The debug's tests pass, as do the
existing suites in `project-agents`, `flow-bootstrap/subflow-candidate` and
`service/project-build`. `tsc` is clean and the structure audit passes.

## What changed and why

### Fix 1: a done proposal is carried across an additive amendment

- **`project-agents/supervisor/state.ts`**
  - `changes()` now also returns `additive` when the only reasons are "its
    parts changed" and/or "its inputs or outputs changed", and both of these
    hold:
    - every part the proposal was built for is still in the subflow, the same
      or reworded;
    - the outputs were only added or renamed (`outputsAdded`). That means the
      same inputs, every kept port unchanged and no output lost. Renames pair
      the lost names with the new ones in order.
  - Role, success check and `after` must be unchanged, because any of those
    reasons stops the result being additive.
  - `carry()` puts such a subflow in a new `forward` map
    (`AutomationStudioProjectSupervisorCarriedForward`: the answered brief,
    `why`, `addedParts` and `renamedOutputs`). It does not go in `kept`, so
    `latestDone()`, assembly and completion never count it.
  - Every other change still drops the proposal. A subflow that runs after a
    carried one is dropped, as it is after any subflow that is not kept.
  - New accessor: `carriedForward()`. New field: `reshapeRefused`, for fix 2.
- **`contracts/subflow-brief.ts`**: a new optional
  `carriedFrom: { briefId, revision, digest, addedParts, renamedOutputs }`. It
  is valid on a build brief only, and is refused
  `project.brief_carried_from` on any other kind. It is parsed from the record.
- **`supervisor/brief-input.ts`**: strips `carriedFrom` from what the model
  sends, so only Core can set it.
- **`supervisor/dispatch-tool.ts`**: `carriedOnto()` names each build brief of
  a carried subflow with `carriedFrom` while that subflow has no done proposal
  under the plan in force.
- **`supervisor/plan-tool.ts`**: the amend answer lists
  `proposalsCarried: [{subflowKey, briefId, revision, why, addedParts?, renamedOutputs?, instruction}]`.
- **`dispatch/run-brief.ts`**: a build brief with `carriedFrom` is shown at
  its opening look under `startsFrom`. The look holds:
  - the script, with renamed outputs rebound;
  - the resolved steps, with denied keys withheld (the same `shownSubflow`
    path that a repair's `yourSubflow` uses);
  - the added parts with their words;
  - `CARRIED_NOTE`: not done, submit it first and test it, judged on every
    part, change only what the trial shows missing.

  Its opening call carries the proposal's calls under `repairs` (t648). If the
  build does not hold the script, it says so (`CARRIED_UNHELD_NOTE`).
- **`dispatch/renamed-outputs.ts`** (new): rewrites `output: <old> = ...` to
  `output: <new> = ...`, so the output keeps the same step output.
- A yes is never carried. The brief can complete only on its own trial's yes,
  through the unchanged subflow gate, and that trial is judged against the
  brief's parts, which now include the added ones.

### Fix 2: a reshape-only subflow is refused once

- **`supervisor/plan-tool.ts`**: a write or amend whose reading carries
  `project.plan_subflow_reshape_only` is refused under `project.plan_refused`.
  The refusal carries:
  - the new words `GUIDANCE.refusals.reshapeOnlyOnce`;
  - each issue with the warning's own words (`why` from `planIssues`);
  - `diagnostics: { resend: "accepted_once" }` (t650), so the repeat guard
    admits the identical resend.
- Each refused subflow is remembered by its key and sorted parts
  (`state.reshapeRefused`). The same subflow sent again is written, with the
  warning beside it as before.
- `plan-input.ts` is unchanged. It still raises the warning, and its test
  still holds.

### Fix 9: a repair's revisions are numbered on from what it is shown

- **`dispatch/run-brief.ts`**: `repairOf` and `carriedOf` return the revision
  they show (the repair's `yourSubflow` revision, or the carried revision).
  That value is passed as `revisionsAfter` to the builder loop.
- **`flow-bootstrap/subflow-candidate/builder-loop.ts`**: a new input,
  `revisionsAfter`, passed to the scoped controller and the gate.
- **`flow-bootstrap/subflow-candidate/scoped-submission.ts`**: proposals are
  numbered `inner + offset`.
  - The candidate controller is `candidate/**` (t661), so it still numbers
    from 1. The translation happens only at this boundary.
  - Kept conditions handed in from this brief's trials are moved back by the
    offset. Refusals go out through the new `submission-numbering.ts`, which
    moves on by the offset:
    - the refusal's `revision`;
    - `standingRevision.revision`;
    - each kept condition's `revision`;
    - every "revision N" in `instruction` and `issues[].message`.
  - `lastTrial` and `judged` are left untouched.
- **`subflow-trial-gate.ts`**: a stale test of a revision at or below
  `revisionsAfter` still names `latestRevision`, which is now the brief's own.
  It also adds `earlierRevision` and a sentence saying that revision belongs
  to an earlier brief.

### Tests

- New `supervisor/tests/amend/tests/carries-proposal.test.ts` (library):
  - the additive amendment lists `proposalsCarried` with revision, `addedParts`
    and the `titles -> list` rename;
  - assembling before a new yes is refused;
  - the next build brief and the record carry `carriedFrom`;
  - the build completes on the new brief's proposal;
  - a model-sent `carriedFrom` is stripped;
  - a change of `after`, a changed old part and a lost output each still drop
    the proposal.
- New `supervisor/tests/reshape-only-refused-once.test.ts` (library):
  - refused once with the warning's words and the resend mark, and the
    identical resend is written;
  - the folded plan is written on the first send;
  - an amendment that splits the subflow out is refused once, then accepted;
  - a word guard on the refusal text.
- New `flow-bootstrap/subflow-candidate/tests/revisions-after.test.ts`:
  - from revision 3, the first proposal is revision 4;
  - testing revision 3 is stale, naming `latestRevision` 4 and
    `earlierRevision` 3;
  - an unchanged refusal says revision 4;
  - the kept-condition refusal names revision 4, and the resend is accepted as
    revision 6;
  - with no `revisionsAfter`, numbering is unchanged;
  - this file uses the existing campsite kept-condition fixture.
- New `dispatch/tests/carried-opening.test.ts`, on the dispatcher's existing
  garden fixture with the real builder loop:
  - `startsFrom` is shown, the opening call carries its calls, and the brief's
    first proposal is revision 2;
  - the output-rename helper is checked;
  - `carriedFrom` on a non-build brief is refused;
  - the debug's fix 9 case: the first brief makes revisions 1 to 3, the trial
    of 3 says no, the repair is shown revision 3, its first revision is 4, and
    its test of 3 is refused naming 4.
- **Moved:** `supervisor/tests/amend-dispatch.test.ts` to
  `supervisor/tests/amend/tests/dispatch.test.ts`. Only its import paths
  changed. Without the move, the supervisor tests directory exceeds the
  25-file hard limit (27 files).
- **Edited:** `supervisor/tests/plan-dispatch.test.ts`. Its warnings test now
  sends the plan twice, because the first send is refused.

### Prompt words that moved (pinned plan words, named as the brief asks)

- `GUIDANCE.tools.amendPlan` (`AMEND_PLAN`): one new sentence on carried
  proposals. The list sentence now ends "and proposalsCarried: send briefs only
  for the carried and dropped subflows and the new ones." The pinned phrase
  "proposalsKept and proposalsDropped" is kept.
- `GUIDANCE.next.afterAmend` and `afterAmendWarned`: "for each subflow under
  proposalsDropped" became "under proposalsCarried or proposalsDropped".
- New: `GUIDANCE.next.carried` (instruction beside each carried entry) and
  `GUIDANCE.refusals.reshapeOnlyOnce`.
- New builder-facing notes in `run-brief.ts`: `CARRIED_NOTE` and
  `CARRIED_UNHELD_NOTE`.
- New sentence in the gate's stale refusal: "Revision N is not one of this
  brief's: it is an earlier brief's ...".
- None of these names a scenario, site or task. The guidance guard test passes.

## Commands run and observed results

All commands were run from `packages/fluxiq` unless noted.

- `npx tsc --noEmit -p tsconfig.json`: no output, exit 0 (final run, after
  every edit).
- Run from the repository root: `node scripts/structure-audit.mjs`
  - After the move: `structure-audit: passed (386 warning(s), 1156 baselined).`
  - Before the move it failed once:
    `FAIL [directory-files] .../project-agents/supervisor/tests/: 27 source files exceeds the 25-file limit`.
    The move fixed it.
  - The baseline run before any edit printed 385 warnings. The new advisory is
    `subflow-candidate/tests/` at 16 files, past 15.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate src/programs/automation-studio/runtime/service/project-build`
  (final run): `Test Files 77 passed (77)`, `Tests 511 passed (511)`.
- Earlier runs failed as follows, and each was fixed:
  - `guidance.test.ts` matched "like" in the new refusal words, which were
    reworded;
  - `plan-dispatch.test.ts` no longer got warnings on the first write, which
    is now refused;
  - the new tests had two of their own bugs: per-brief step lists, and a
    kept-condition matcher.

## Not verified

- No live run (the brief said not to). Whether a real supervisor sends the
  carried brief, and whether a real builder resubmits the carried script with
  its own handles and passes, is not shown.
- Renumbering rewrites "revision N" in a refusal's `instruction` and issue
  messages by pattern. Text quoted inside those strings is also shifted: a
  kept condition's written JSON, or a row label that itself contains
  "revision <digits>". No such case was tested.
- `reshapeRefused` lives only in memory. A supervisor restarted on a build
  under way refuses the same subflow once more.
- `service/**` callers of the builder loop do not pass `revisionsAfter`. Only
  the dispatcher's `run-brief.ts` does, which is the path project builds use.
  No `service/**` file was touched.
- Architecture documentation under Core `docs/architecture/` was not updated,
  because it is outside this brief's paths.

## Open questions or contradictions found

- The cleanest numbering fix is a start-revision option on
  `flow-bootstrap/candidate/submission.ts` (`private revision = 0`). That file
  belongs to t661, so the translation layer
  (`subflow-candidate/submission-numbering.ts`) stands in for it. If t661 or a
  later task adds such an option, the translation can be deleted.
- The debug says the carried script is "submitted as its revision 1". Core
  cannot do that: the earlier builder's handles (`tN`, `extraction.N`) are
  unknown to the new builder's submission check, as `YOUR_SUBFLOW_NOTE`
  already says. So the brief shows the script with the outputs rebound and
  tells the builder to resubmit it first with its own handles and test it.
- Fixture vocabulary: the new supervisor tests use the library fixture. The
  new dispatch and subflow-candidate tests reuse those modules' existing
  fixtures (a garden catalogue, the listings scope and the campsite
  kept-condition corpus) rather than a new library or hardware-store fixture.
  None of them is a Lab scenario.
