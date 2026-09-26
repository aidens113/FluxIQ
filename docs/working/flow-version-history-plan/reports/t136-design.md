# Report: t136-design

## Outcome

Done. The design working document exists at
`F:\!FluxIQ\docs\working\flow-version-history-plan.md` (529 lines) and its row
is in `F:\!FluxIQ\docs\working\README.md`. Design only — no code changed, no
build run, nothing committed, per the brief.

## What changed and why

Two files, both documentation, both in FluxIQ Core.

**`F:\!FluxIQ\docs\working\flow-version-history-plan.md`** (new). The design the
brief asked for, in Core's working-document format: header block, `Current
State` (48 lines, under the 150 limit), reference sections, `Work Ledger`,
`Open Questions`.

**`F:\!FluxIQ\docs\working\README.md`**. One row added to `## Active`, in
alphabetical position between `flow-authoring-and-defensive-runtime-plan.md` and
`module-size-governance-plan.md`, and the footer count corrected from "16 of 31"
to "16 of 32". The new document is under 800 lines so the ⚠ count is unchanged.

### The finding that shaped the design

The brief said to look before inventing. Core already has the store.

`graph_revisions` and `graph_operations`, in each project's SQLite database, are
a numbered, parented, digested, fully invertible history per graph Flow.
`graph_operations` carries `before_json` and `after_json` for every entity a
revision touched, so the inverse of any revision is exact and already recorded.

Four consequences that decide the whole shape of the answer:

1. **A subflow's graph is its own Flow row.** The `flows` table has
   `parent_flow_id` and `owning_subflow_id`, and
   `normalizeAutomationStudioFlowBuildPlan` mints a `graphFlowId` per subflow.
   Each therefore has its own `graph_revision` counter. Requirement 3 of the
   brief — subflows version independently, the unit versioned matching the unit
   edited — is satisfied by the storage shape that exists. Nothing needs
   building for it.
2. **`getFlow` materializes nodes and edges from the chain**, via
   `materializeCanonicalGraphFlow` (`runtime/service/flows/store.ts:81`). The
   chain is the executable truth, not a side index, so restoring a revision
   restores what a run executes. This is what makes the cheap design possible.
3. **Every model change already lands as a revision.**
   `applyFlowBootstrapAdaptation` calls `this.flows.replaceFlowGraphIndex(...)`
   for each subflow graph, and `replaceFlowGraphIndex` turns a whole-document
   save into a delete-all/add-all patch through `applyPatch`. A `create` writes
   revision 1 via `importMonolithicFlowGraph`; an `extend` — the re-author path —
   writes revision N+1 with complete before/after operations.
4. **`applyPatch` already computes `inverseOperations`** and
   `replaceFlowGraphIndex` throws them away.

### The four gaps the design fills

- **G1, no provenance.** `source` is `"editor_patch"` and `message` is the fixed
  string `"Reconcile recording-generated Flow graph"`. A revision cannot say
  which adaptation, which run or which entry point produced it, so nothing can
  find "the revision the repair wrote".
- **G2, nothing reads the chain backwards.** No restore method exists on
  `AutomationStudioProjectGraphRepository`.
- **G3, the verdict is not bound to a version.** `resultVerification` keys to a
  run. Separately, `automationStudioResultCheckEpoch` reads the *parent* Flow's
  `metadata.graphRevision` as the epoch — and the parent's revision does not move
  when a subflow graph is rewritten, so the result-check count does not restart
  after a repair, which is what the epoch exists to do. Raised as Q4, not fixed.
- **G4, and this is the sharpest one.** `revertFlowBootstrapAdaptation`
  (`runtime/service.ts:3747`) refuses `extend` mode outright. Its own comment
  says why: *"An extend overwrites the Subflow graph it was given rather than
  creating one, and `parentBefore` holds the parent's metadata and not that
  graph, so there is nothing here to put back... Refused until an extend records
  what it overwrote."* The graph chain records exactly that. The revert never
  learned to look. **The one mode that cannot be reverted today is the repair
  path.**

### What the design proposes

Migration `0023`: one nullable `provenance_json` column on `graph_revisions`
(reusing the existing free-text `source` for the entry-point token), and one
`flow_graph_judgements` table keyed `(flow_id, revision_number, run_id)` with
`status`, `code` and `instruction_digest`.

A run's **version set** — `[{ graphFlowId, revision }]` for the graphs it
actually executed — captured from `materializeCanonicalGraphFlow`'s existing
`metadata.graphRevision` stamp, written onto the run detail, and used to write
one judgement row per executed graph after the verdict.

`restoreFlowGraphRevision(flowId, toRevision, provenance)` that **rolls
forward**: it reads the target state (from `snapshot_object_id` where present,
otherwise by replaying `graph_operations` backwards) and writes the difference
as a *new* revision marked `rollback`. Nothing is truncated. Three reasons:
`revision_number` must stay monotonic for the unique index and the
`flows.graph_revision` counter; a rollback that erased history would be the same
class of irreversible act as the regression it undoes; and a rollback that is
itself a revision can itself be rolled back.

"Worse" is four conditions, all from the evaluator: the new revision's
provenance names a model entry point; there is a `confirmed` judgement at an
earlier revision on the same graph Flow under the same instruction digest; the
judgement at the new revision is `refuted`; and the one-cycle repair has already
spent itself. Explicitly excluded: `unverified → refuted`, no prior judgement,
**`confirmed → failed`** (a failure is the site's, and this exclusion is the most
important one in the design), `confirmed → unverified`, a different instruction
digest, and any `manual` revision.

Rollback fires by default with no approval — it is restorative, returning a Flow
to a state the evaluator itself confirmed — and does not re-run afterwards,
because the restored version already carries a confirmed judgement.

Four phases: Record, Restore, Decide, Bound. Phases 1 and 2 are independent of
the rollback question. Phase 3 is the one that waits on evidence.

## Commands run and observed results

All reads. No build, no test, no commit, no write to any `.ts` file.

- `python -c` over
  `F:\!FluxIQWebExtension\test-runs\run-muht9lpw-a39aa056\snapshots\flow-lane.json`
  -> confirmed the brief's account exactly: 19 `evidenceLoop.steps`, 16
  `loopProviderCalls`, eight `core.run_node` rows with
  `resultCode: "web.action.succeeded"`, two `web.detect_repeating_structure`
  rows with `web.structure.detected`, one refusal at iteration 0
  (`web.action.rejected.not_at_start_location`), and none after it. Two
  `core.decision_amend_draft` rows at iterations 14 and 15, each answered
  `llm_evidence_loop.draft_rerun`; `review.appliedMutationCount: 2`. Result:
  `flowShape.nodeCount: 1`, `actionTypes: { "web.dom.extract_list": 1 }`,
  `navigationNodes: 0`, `ownPage.required: true`, `ownPage.reached: false`, and
  three `action_failed` attempts on
  `Cannot access contents of url "about:blank"`.
- `grep -rn "settingsRevision" / "graphRevision" / "inverseOperations" /
  "rollback"` over `packages/fluxiq/src/programs/automation-studio/` -> located
  the revision chain, `adaptation-store.ts`'s `kind: "rollback"` artifact, and
  `runtime/service/adaptations/durable.ts`'s
  `rollbackDurableAdaptationMutations`, which handles runtime adaptations and
  not bootstrap ones.
- Read in full: `flow-draft/amendment.ts`, `flow-draft/draft.ts`,
  `flow-bootstrap/adaptation.ts`, `flow-bootstrap/draft-reduction.ts`,
  `recovery/refuted-result/repair.ts`, `recovery/refuted-result/reauthor.ts`,
  `result-verification/verification-status.ts`,
  `storage/project/graph-store.ts` (exports and `applyPatch`),
  `runtime/service/flows/store.ts` (`getFlow`, `replaceFlowGraphIndex`,
  `materializeCanonicalGraphFlow`), and `runtime/service.ts:1835-1880`,
  `3623-3800`.
- `git status --short` in `F:\!FluxIQ` -> `docs/working/README.md` modified and
  `docs/working/flow-version-history-plan.md` untracked are mine. The other
  entries — `flow-bootstrap/generation-failure.ts`, `flow-bootstrap/index.ts`,
  `flow-bootstrap/plan/issue-feedback.ts`,
  `llm/harness-options/bootstrap-completion.ts` and its test,
  `runtime/service.ts`, `docs/architecture/automation-studio/llm-flow-bootstrap.md`,
  the untracked `flow-bootstrap/reachability/` directory and
  `runtime/tests/service-bootstrap/tests/t135-probe.test.ts` — were already
  dirty when I started and I never wrote to any of them.
- `wc -l docs/working/flow-version-history-plan.md` -> 529.
- `awk` over the `Current State` section -> 48 lines, under the 150 limit.
- `grep -n "^## "` -> section order is `Current State`, reference sections,
  `Work Ledger`, `Open Questions`, as the protocol requires.

## Not verified

- Nothing compiles or runs. This is a design document; no code was written, and
  neither repository was built, as the brief required (live runs are using both
  `dist` trees).
- **Where the version set is captured on the live build-and-run path.**
  `compiled-plan.ts` carries `graphRevision`, `graphRevisionId`, `graphDigest`
  and `provenance.instructionDigest` per Flow, and a run started from a compiled
  artifact records `artifact_id` on its row — but the language-driven path
  appears to run through `runRuntimeSession` without a compiled artifact. I did
  not trace that path to a single point where every executed graph document
  passes. Recorded as Q2.
- **What `instructionDigest` digests.** It is `sha256` over the *resolved
  instruction objects*, which carry ids and priorities, so re-ordering
  instructions without changing their text would change the digest and silently
  sever a Flow from its own confirmed history. I did not confirm whether that
  matters in practice. Recorded as Q3, and it must be settled before Phase 1
  because the value is written into rows that cannot be recomputed.
- Whether `K = 50` retained revisions is the right constant. Asserted, not
  measured.
- I did not read `runtime/flow-bootstrap/reachability/check.ts` beyond its
  header and the first 60 lines, and did not read `plan-locations.ts` or
  `library-locations.ts` at all, because that directory is untracked and being
  written by another agent right now.

## Open questions or contradictions found

1. **The brief's premise and the code's state partly disagree, in a way worth
   the supervisor's attention.** `runtime/flow-bootstrap/reachability/check.ts`
   names `run-muht9lpw-a39aa056` in its own header and exists specifically to
   refuse a plan whose steps all act on a target no step of it opened — before
   it is proposed, at no provider cost. It is untracked in the Core working tree
   as of 2026-09-25. So the regression in the brief's evidence is already being
   fixed upstream of anything this plan would build. I have said so plainly in
   the document rather than writing around it.
2. **The rollback rule would have fired zero times on the evidence available.**
   Its precondition is a `confirmed` judgement on an earlier revision of the
   same graph Flow under the same instruction, and no such record exists
   anywhere today — including for `run-muht9lpw-a39aa056`, whose one-node Flow
   never had a confirmed ancestor. The capability turns itself on one confirmed
   run at a time, which I argue is correct behaviour rather than a defect (a
   rollback to a version nothing ever confirmed is precisely the case the rule
   refuses), but it means Phase 3 is machinery with an empty input until the
   loop starts producing confirmed runs.
3. **`automationStudioResultCheckEpoch` is reading the wrong revision.** It
   takes the parent Flow's `metadata.graphRevision` as the epoch a run belongs
   to, and the parent's revision does not move when a subflow graph is
   rewritten — so the result-check count does not restart after a repair, which
   is the one thing the epoch exists to do. Real, separate, cheap to fix once
   the version set exists. Recorded as Q4 so it is not lost; not fixed here
   because it is outside the brief.
4. **Q1**, in the document: whether a run's version set should include subflows
   the router did not select. The document proposes no, and gives the
   counter-case and why the rule already handles it.
