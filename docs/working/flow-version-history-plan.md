# Flow Version History Plan

Status: Active
Status detail: Design only, nothing implemented; the three storage gaps and the rollback rule are specified, and the phase order deliberately puts recording before deciding.
Created: 2026-09-25
Last updated: 2026-09-25
Owner: Senior supervisor agent (Core runtime: `programs/automation-studio/runtime/` and `programs/automation-studio/storage/project/`)
Scope: A version history for Flows and subflows in Core, such that every model-made change produces a reachable version, the evaluator's judgement is bound to the version it judged, and a change the evaluator finds worse is rolled back automatically. Covers the graph revision chain, its provenance, the judgement binding, the restore command, the rollback rule, and what bounds the history. It does not cover browser behaviour, the extension, or any UI.
Paired document: none
Related: [AGENTS.md](../../AGENTS.md), [working document index](./README.md), [flow-authoring-and-defensive-runtime-plan.md](./flow-authoring-and-defensive-runtime-plan.md), [adaptive-flow-training-roadmap.md](./adaptive-flow-training-roadmap.md)

---

## Current State

**Design only. Nothing here is implemented and no code has been changed.**

The instruction, from the user on 2026-09-26: a bad model decision can regress a
Flow, so Flows and subflows need a version-control system at the Core level,
where a change that breaks a Flow according to the evaluator can be rolled back.

**What the investigation found, and it changes the shape of the answer.** Core
already has a per-graph version chain. `graph_revisions` and `graph_operations`
in each project's SQLite database hold a numbered, parented, digested, fully
invertible history of every graph Flow, and `getFlow` materializes a Flow's
nodes and edges *from that chain* rather than from the JSON document. A
subflow's graph is its own Flow row, so subflow graphs already version
independently of their parent — requirement 3 of the brief is satisfied by the
storage shape that exists. Every bootstrap apply and every re-author already
writes a revision through `replaceFlowGraphIndex`.

So this is not a new store. It is four missing joins onto one that exists:

1. A revision cannot say **who made it or why** — `source` is `editor_patch`
   and `message` is a fixed string.
2. Nothing **reads the chain backwards**. `applyPatch` computes
   `inverseOperations` and `replaceFlowGraphIndex` discards them.
3. A verdict is **not bound to a version**. `resultVerification` keys to a run.
4. `revertFlowBootstrapAdaptation` **explicitly refuses `extend` mode**, which
   is the repair path, because `parentBefore` does not hold the graph an extend
   overwrote. The graph chain does hold it; the revert never learned to look.

**Done:** the design below, and the read of the eight Core modules it builds on.

**Not done:** all of it. Phases 1-4 in
[Phases](#phases) are unstarted.

**Next steps**

1. Decide the three [Open Questions](#open-questions), which are cheap reads.
2. Build Phase 1 (record). It changes no behaviour and is what makes any later
   rollback possible.
3. Do not build Phase 3 (the automatic trigger) until there is a second, real
   regression that the reachability gate did not catch. See
   [What this plan would not build](#what-this-plan-would-not-build).

**Blockers:** none. One conflict to respect:
`runtime/flow-bootstrap/reachability/` is **untracked in the Core working tree
as of 2026-09-25** — another agent is building it concurrently. Nothing here
edits it.

---

## The evidence

`F:\!FluxIQWebExtension\test-runs\run-muht9lpw-a39aa056`, snapshot
`snapshots/flow-lane.json`.

The exploration worked. Nineteen decision rows, sixteen loop provider calls,
eight successful `core.run_node` calls, two `web.detect_repeating_structure`
detections, one refusal at iteration 0 (`not_at_start_location`) and none after
it. The loop navigated, cleared the page's interruptions, found the list and
read it.

Then two `core.decision_amend_draft` decisions at iterations 14 and 15, each
answered `llm_evidence_loop.draft_rerun`, and `review.appliedMutationCount: 2`.
What came out: `flowShape.nodeCount: 1`, `actionTypes: { web.dom.extract_list: 1 }`,
`navigationNodes: 0`. Replay failed on its first action, three attempts, all
`action_failed`: `Cannot access contents of url "about:blank"`.
`ownPage.required: true`, `ownPage.reached: false`.

The model deleted steps it had itself proved, and there was no earlier version
to return to. That is the regression class this plan is about.

**One honest qualification.** The specific defect in this run is already being
fixed upstream of here. `runtime/flow-bootstrap/reachability/check.ts` — written
for this exact run, named in its own header, and sitting untracked in the Core
working tree right now — refuses a completed plan whose steps all act on a
target no step of it opened, before it is ever proposed, at no provider cost.
Version history would not have been the cheapest fix for this run. It is
insurance against the regressions no gate anticipated.

---

## What Core already has

Read before inventing; all of this exists today.

| Thing | Where | What it gives |
| --- | --- | --- |
| `graph_revisions` | `storage/project/schema/domain-resources.ts` | `revision_id`, `flow_id`, `revision_number`, `parent_revision`, `author_id`, `source`, `operation_count`, `snapshot_object_id`, `digest`, `message`, `created_at_ms`. Unique on `(flow_id, revision_number)`. |
| `graph_operations` | same | `before_json` / `after_json` per entity per revision. An exact inverse, already. |
| `applyPatch` | `storage/project/graph-store.ts` | Optimistic on `baseRevision`, returns `conflict` on a race, and returns `inverseOperations`. |
| `createSnapshot` | same | Writes a whole-graph snapshot to the content store and stamps `snapshot_object_id`. |
| `replaceFlowGraphIndex` | `runtime/service/flows/store.ts` | Turns a whole-document save into a delete-all/add-all patch, so a bootstrap apply *already* lands as a revision. |
| `getFlow` → `materializeCanonicalGraphFlow` | same | Nodes and edges come from the graph store. **The chain is the executable truth, not a side index.** |
| Subflow graphs are Flows | `flows` table: `parent_flow_id`, `owning_subflow_id`; `normalizeAutomationStudioFlowBuildPlan` mints `graphFlowId` per subflow | Independent revision counters per subflow, for free. |
| Adaptation lifecycle | `runtime/flow-bootstrap/adaptation.ts` | `status: proposed/validated/applied/rejected/reverted`, `application`, `revert`, `auditEvents` with `eventType: "rollback"` already in the union. |
| Compiled plan provenance | `runtime/compiled-plan.ts` | Per-Flow `graphRevision`, `graphRevisionId`, `graphDigest`, and `provenance.instructionDigest`. |
| The evaluator | `runtime/result-verification/` | `confirmed` / `refuted` / `unverified` / `no_result`, fail-closed, two-call agreement before a refutation stands. |
| The repair route | `runtime/recovery/refuted-result/` | `resultRepair` marker, one-cycle structural bound, `resultReauthor` record, `rerunRepairedFlow`. |
| Change verdict | `runtime/flow-change/verdict.ts` | Precedent for "what did this change prove", at node-trial grain. Not reused here; different question. |

---

## The design

### What a version is

**A version is one `graph_revisions` row on one graph Flow.** No new concept.

It contains what that row already contains, plus the `graph_operations` rows
that produced it — a `before` and an `after` for every node, edge and region the
revision touched — and optionally a whole-graph snapshot object.

It is identified by `(flowId, revisionNumber)`, which is already uniquely
indexed. `revisionId` is derived from the pair.

### How a subflow version relates to its Flow's

They are siblings, not parent and child. A subflow's graph is a Flow row of its
own with its own `graph_revision` counter, so a repair that rewrites one
subflow's graph moves that graph's revision and moves nothing else. **The unit
versioned already matches the unit edited.**

The parent orchestration Flow is a third versioned unit, changing when its
router or subflow set changes. Its revision number is therefore *not* a Flow-wide
version and must not be read as one. (It is read as one today, in
`automationStudioResultCheckEpoch`, which takes the parent's
`metadata.graphRevision` as the epoch a run belongs to. That is a real but
separate defect — the epoch does not move when a subflow graph is rewritten, so
the result-check count does not restart after a repair. Noted, not fixed here.)

### Gap 1 — a version says who made it and why

Migration `0023_graph_revision_provenance` adds one nullable column:

```text
alter table graph_revisions add column provenance_json text
```

Reuse the existing `source` column for the entry point token, whose current
values are `legacy_import` and `editor_patch`; add `flow_bootstrap`,
`result_reauthor`, `runtime_patch`, `manual` and `rollback`. `provenance_json`
carries the ids: `{ adaptationId?, runId?, mode?: "create" | "extend",
restoredFrom?: number, instructionDigest? }`.

Three writers must stamp it, each taking one new optional argument:
`replaceFlowGraphIndex` (the bootstrap apply path, and the one that matters),
`applyFlowGraphPatch`, and `importMonolithicFlowGraph`. The adaptation id has to
travel from `applyFlowBootstrapAdaptation` down to `replaceFlowGraphIndex`; it
is in scope at that call site today and is simply not passed.

A null `provenance_json` reads as *unknown provenance*, which is never a
rollback trigger. That is what makes every existing revision safe without a
backfill.

### Gap 2 — the run's version set

A run executes one or more graph Flows. The set of `(graphFlowId,
revisionNumber)` pairs it actually executed is the run's **version set**, and it
is what a verdict is about.

Capture it where the run resolves its Flow documents.
`materializeCanonicalGraphFlow` already stamps `metadata.graphRevision` on every
document it returns, so the value is in hand at the moment the executor is given
a graph; nothing new has to be read. Write it onto the run detail as
`flowVersions: [{ graphFlowId, revision }]`.

Only graphs the router actually selected belong in the set. A subflow that was
never entered was not judged and must not be rolled back. (See
[Open Questions](#open-questions) Q1.)

### Gap 3 — the judgement is bound to the version

Same migration, one table:

```text
create table flow_graph_judgements (
  flow_id text not null,
  revision_number integer not null check (revision_number > 0),
  run_id text not null,
  status text not null check (status in ('confirmed','refuted','unverified','no_result')),
  code text not null,
  instruction_digest text not null,
  decided_at_ms integer not null,
  primary key (flow_id, revision_number, run_id)
)
```

Written by `runtime/result-verification/run-outcome.ts` immediately after the
verdict is reached and the run detail is recorded, once per entry in the run's
version set. `status` is exactly `automationStudioResultVerificationStatus`'s
four values; `code` is the verdict code from
`AUTOMATION_STUDIO_RESULT_VERDICT_CODES`.

`instruction_digest` is load-bearing. "Worse" is only meaningful against the
same question: a confirmed run under one instruction and a refuted run under
another prove nothing about each other. The compiled plan already computes
`provenance.instructionDigest` over the resolved instruction set, and the same
digest function is used here.

### Gap 4 — restore

One new method on `AutomationStudioProjectGraphRepository`:

```text
restoreFlowGraphRevision({ flowId, toRevision, provenance })
```

**It rolls forward, never backward.** It reads the target revision's state, then
writes the difference from the current state as a *new* revision with `source:
"rollback"` and `provenance.restoredFrom: toRevision`. Nothing is deleted or
truncated. Three reasons: `revision_number` must stay monotonic for the unique
index and the `flows.graph_revision` counter; a rollback that erased history
would be the same class of irreversible act as the regression it is undoing; and
a rollback that is itself a revision can itself be rolled back.

It reads the target state on one of two bases, with the same honesty about which
one it used that `flow-bootstrap/draft-reduction.ts` already practises:

- **snapshot** — `snapshot_object_id` is present on the target revision, so the
  whole graph is read from the content store in one go.
- **replay** — walk `graph_operations` backwards from the current revision to
  the target, applying each operation's `before_json`. Exact, because every
  operation carries both sides.

If the walk meets a revision whose operations have been pruned, it does not
guess: it refuses with `revision_no_longer_restorable` and records the refusal.

Afterwards the canonical document is rewritten from the new graph state, exactly
as `applyFlowGraphPatch` already does.

**This also fixes `revertFlowBootstrapAdaptation`'s stated refusal.** An
`extend`-mode adaptation is refused revert today on the grounds that
`parentBefore` holds the parent's metadata and not the subflow graph the extend
overwrote. The graph chain holds precisely that. Once restore exists, an extend
reverts by restoring each touched graph Flow to the revision named in the
adaptation's own provenance, and the refusal can be removed.

---

## What "worse" means, and who decides it

**The evaluator decides, and nothing else may.** `runtime/result-verification/`
reaches the verdict; the model's opinion of its own edit is never an input. The
two-call agreement rule already in `agreement.ts` stands: a single refutation
does not fail a run whose steps all succeeded, so it does not trigger a rollback
either.

A change to graph Flow `F` producing revision `M` is **worse** when all four
hold:

1. `M`'s `source` names a model entry point — `flow_bootstrap`,
   `result_reauthor` or `runtime_patch`. Never `manual`, never `rollback`,
   never null.
2. There is a judgement on `F` at some revision `N < M` with status
   `confirmed`, under the same `instruction_digest`, and it is the most recent
   confirmed judgement on `F`.
3. The judgement on `F` at `M`, under that same digest, is `refuted`.
4. The one-cycle repair has already run and its re-run was also judged, so the
   refutation at `M` is the *settled* verdict and not the one that is about to
   be repaired.

Then the rollback target is `N`.

### What is deliberately not worse

- **`unverified` → `refuted`, or no prior judgement at all.** There is no proved
  predecessor. Rolling back to a version nobody confirmed trades one unknown for
  another and spends a run finding out.
- **`confirmed` → `failed`.** A run that failed at a step failed for the site,
  the network or the page. That is the repair ladder's business, and treating a
  failure as evidence against the last edit would undo good edits every time a
  site was slow. This is the single most important exclusion in the design.
- **`confirmed` → `unverified`.** Nobody judged it. Fail-closed governs the
  run's reported status; it does not license destroying an edit.
- **A different `instruction_digest`.** Different question, no comparison.
- **A `manual` revision.** A person's edit is not undone by machinery. The
  person is told; the machinery stops.

### The one deterministic addition, and why it waits

`confirmed` → *the Flow can no longer run at all*, where Core can attribute the
inability to the edit itself rather than to the site. The concrete case is the
evidence run: the confirmed predecessor reached its start location, and the
successor has no step that does. That is **Core's own structural observation**,
computed by `flow-bootstrap/reachability/`, not a model grading itself, so it
does not violate the "evaluator only" rule.

It still waits. The reachability gate stops that plan *before it applies*, which
is strictly better than applying it and rolling it back, and until the gate has
been measured there is no evidence that anything gets past it. Build this second
trigger only if something does.

---

## When a rollback fires, and when it must not

**It fires by default, with no approval and no strict-mode opt-in.** A rollback
is restorative: it returns a Flow to a state the evaluator itself confirmed. It
destroys nothing a person authored and spends nothing. Requiring a press would
reproduce exactly the failure the whole repair route was built to end — a
receipt nobody is shown. What a stricter mode may do is require approval; the
default is that it happens.

It must not fire:

- **While the one-cycle repair is in flight.** The rollback decision is
  evaluated only at the tail of the *second* pass of
  `verifyAutomationStudioRuntimeSessionResult` — the pass entered after
  `rerunRepairedFlow`, where the `resultRepair` marker is already present and
  `repairAutomationStudioRefutedRunResult` answers nothing at its first line.
  The repair gets its one cycle; rollback is what happens when that cycle spent
  itself and the answer is still wrong.
- **When the run's version set is stale** — the graph moved between the run and
  the verdict. The judgement is written against the revision that ran, and a
  rollback is computed only when the current revision is still `M`.
- **On a race.** The restore is a graph patch and takes `applyPatch`'s existing
  `baseRevision` guard. A `conflict` result abandons the rollback and records
  it; it is never forced.
- **More than once on the same chain.** A `rollback` revision is never itself a
  rollback trigger. If the restored version `N` is then refuted under the same
  instruction, the Flow is recorded as having no confirmed version for this
  instruction and the loop stops. No ping-pong.
- **When the target is unrestorable** — pruned operations, missing snapshot.
  Recorded, not guessed.

### And it does not re-run afterwards

The restored version already carries a `confirmed` judgement. Re-running it to
prove again what is on record spends a run and a verification for nothing. **The
rollback closes the cycle; it does not open a third.** The next scheduled run
judges the restored Flow in the normal course.

---

## How a run shows its versions

Everything goes where the equivalent facts already go, so a reader has one place
to look.

- `AutomationStudioFlowRunDetail.metadata.flowVersions` — the version set, as
  `[{ graphFlowId, revision }]`.
- `metadata.resultVerification` — unchanged. The judgement rows key to the same
  `(flowId, revision, runId)`.
- `metadata.resultRollback` — new, beside the established `resultRepair` and
  `resultReauthor` markers:
  `{ graphFlowId, from, to, applied: true }`, or
  `{ applied: false, code }` where it was considered and did not fire. A
  considered-and-declined rollback is a stated reason, never a silence — the
  same rule `resultReauthor` already follows.
- The bootstrap adaptation whose revision was undone gains a `rollback` audit
  event. `AutomationStudioBootstrapAuditEvent.eventType` already has the value.

The downstream extension's `flow-lane.json` will want `flowVersions` and
`rollback` beside `resultVerification` so an evaluation can see which version was
judged. That is the downstream repository's change; it is not specified here, and
it is the one thing in this plan that will need a paired document in
`F:\!FluxIQWebExtension\docs\working\` when Phase 1 is built. Until then this
document's `Paired document` field is `none`.

---

## What is stored, where, and how much

| What | Where | Bound |
| --- | --- | --- |
| Revision rows | `graph_revisions`, per-project SQLite | Kept forever. A few hundred bytes each. |
| Operation rows | `graph_operations`, same | Kept for the newest `K = 50` revisions per graph Flow, plus every revision that is a rollback target. |
| Snapshots | content store, via `createSnapshot` | One per **confirmed** revision. Never pruned while it is the newest confirmed one for its Flow. |
| Judgements | `flow_graph_judgements`, same database | One row per judged `(flow, revision, run)`. Pruned with the run it names. |

Three bounds, cheapest first:

1. **Operations are the history; snapshots are the optimisation.** The chain is
   replayable from operations alone, so nothing has to be snapshotted for
   correctness.
2. **Snapshot on confirmed.** A confirmed version is the one a rollback targets,
   so it is the one worth paying for, and it makes restore O(1) instead of a
   walk of up to `K` revisions.
3. **Prune operations, never revisions.** Beyond `K`, drop `graph_operations`
   for revisions that are neither the newest confirmed nor inside the window.
   The revision row, its digest and its provenance stay forever, so the history
   stays *readable* where it is no longer *replayable*. A restore to such a
   revision refuses rather than guessing — the honest degradation.

`K = 50` is one revision per model change, which is months of a Flow's life. It
is a constant in one place, not a setting.

---

## Migration for Flows that exist today

**No backfill, no rewrite, no migration job.** Three populations:

1. **Flows with a graph chain.** Nothing to do. Their revisions gain a null
   `provenance_json`, which reads as unknown provenance and can never be a
   rollback trigger. Safe by construction.
2. **Flows whose graph was never indexed.** `importMonolithicFlowGraph` already
   runs on the first patch or the first viewport read and writes revision 1 as
   `legacy_import`. Their history begins the first time a model changes them.
3. **Runs already judged.** `flow_graph_judgements` starts empty. So the first
   model change after this lands has no confirmed predecessor and cannot be
   rolled back — which is correct, because a rollback to a version nothing ever
   confirmed is exactly the case the rule refuses.

The capability turns itself on one confirmed run at a time. That is the payoff
of building on the chain that already exists rather than beside it.

---

## What this plan would not build

1. **Not a Flow-wide version number.** It would have to move when any subflow's
   graph moved, which would invalidate every other subflow's history on every
   repair and make a targeted rollback impossible. The graph Flow is already the
   right grain; a coarser one is strictly worse.
2. **Not versions of every artifact.** Router rules, subflow records,
   instructions and settings all change too. Versioning them all is a
   general-purpose document-versioning project. The unit a repair edits is the
   subflow graph. Version that and nothing else until a measured regression
   comes from somewhere else.
3. **Not unlimited history.** See the bounds above. A design that versions
   everything forever is the expensive wrong answer.
4. **Not a version browser, a diff view or a restore button.** No UI in this
   plan at all. The rollback is automatic; a person who wants one presses
   nothing. A UI can come when someone asks to *see* history, which is a
   different request.
5. **Not a rollback on a failed run.** The strongest thing left out, and the one
   most likely to be argued for. A failure is the site's, and this would undo
   good edits routinely.
6. **Not a re-run after rollback.**
7. **Not branching, merging, tags or named versions.** A linear per-graph chain
   with restore-forward is the whole of what "put back what worked" needs.
8. **Not this, first, as the answer to the evidence run.** The reachability gate
   already in the Core working tree stops `run-muht9lpw-a39aa056` before it
   applies, at no provider cost. Version history is insurance against
   regressions no gate anticipated. Phase 1 is worth building regardless,
   because a run that cannot say which version it judged cannot be reasoned
   about at all — but the automatic trigger should wait for a second, real
   regression that the gate did not catch.

---

## Phases

**Phase 1 — Record.** Provenance column and the three writers; the run's version
set; the judgement table and its writes in `run-outcome.ts`. Changes no
behaviour. On its own it answers "which version was judged", which nothing can
answer today, and it is the precondition for everything else.

**Phase 2 — Restore.** `restoreFlowGraphRevision`, its two bases, its refusals,
the canonical rewrite. Remove the `extend`-mode refusal in
`revertFlowBootstrapAdaptation` and route it through the chain.

**Phase 3 — Decide.** The worse-rule and the automatic trigger at the tail of
the second verification pass. `resultRollback` on the run; the `rollback` audit
event. Permissive by default.

**Phase 4 — Bound.** Snapshot-on-confirmed, operation pruning at `K`,
`revision_no_longer_restorable`.

Phases 1 and 2 are independent of the rollback question and safe to build now.
Phase 3 is the one that waits on evidence.

---

## Work Ledger

### 2026-09-25 — Design authored
- Agent: worker (task t136)
- Changed: `docs/working/flow-version-history-plan.md` (new),
  `docs/working/README.md` (index row)
- Why: The user asked for a Core-level version history for Flows and subflows
  with automatic evaluator-driven rollback, after a build's `amend_draft`
  decisions destroyed work the exploration had proved and nothing could restore
  it.
- Validation: `not validated` — design only, no code changed. The Core reads
  behind it are listed in [What Core already has](#what-core-already-has); the
  evidence reads are `snapshots/flow-lane.json` of
  `run-muht9lpw-a39aa056`. Neither repository was built, per the brief.
- Outcome: Accepted
- Follow-up: Settle the three open questions, then Phase 1.

---

## Open Questions

**Q1 — Does a run's version set include subflows the router did not select?**
Owner: Core runtime. The proposal above is no: an unentered subflow was not
judged and must not be rolled back. The counter-case is a router change that
made the wrong subflow reachable, where the regression is in the parent and the
unentered subflow is innocent — which the rule already handles, since the parent
is its own versioned unit. Confirm and close.

**Q2 — Where exactly is the version set captured on the live build-and-run
path?** Owner: Core runtime. `compiled-plan.ts` carries `graphRevision`,
`graphRevisionId` and `instructionDigest` per Flow, and a run started from a
compiled artifact records `artifact_id` — but the language-driven path appears
to run through `runRuntimeSession` without a compiled artifact. The proposal is
to capture from `materializeCanonicalGraphFlow`'s `metadata.graphRevision`,
which is reliable on both paths. Needs one read of the live run path to confirm
there is a single place where every executed graph document passes.

**Q3 — What exactly does `instruction_digest` digest?** Owner: Core runtime.
`compiledPlan.provenance.instructionDigest` is `sha256` over the *resolved
instruction objects*, which include ids and priorities — so re-ordering
instructions without changing their text would change the digest and silently
sever a Flow from its own confirmed history. A digest over instruction *text*
alone may be the right one here. Decide before Phase 1, because the value is
written into rows that cannot be recomputed later.

**Q4 — Should `automationStudioResultCheckEpoch` move to the version set?**
Owner: Core runtime. It reads the *parent* Flow's `metadata.graphRevision` as
the epoch, and the parent's revision does not move when a subflow graph is
rewritten — so the result-check count does not restart after a repair, which is
what the epoch exists to do. Real, separate, and cheap to fix once the version
set exists. Not in scope here; raised so it is not lost.
