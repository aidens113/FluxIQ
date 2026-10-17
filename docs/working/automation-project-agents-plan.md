# Automation Project Agents Plan

Status: Active
Status detail: A1-A6 delivered; A8 passed (downstream frozen pair 8) and `project` is the product default since 2026-10-16 (t667). Now: the cost gap (P1-P5; t672, t673 merged). User decision 2026-10-13: concurrent agents in Core, the extension one at a time.
Created: 2026-10-13
Last updated: 2026-10-16
Owner: Senior supervisor agent
Scope: Core's share of FluxIQ's product-level agent system for building an automation: the project supervisor, subflow builder and repair agent roles; the build record, task spec, structure plan, brief, return, allowance, host-resource scheduling and cancellation contracts; per-role tool scopes; assembly through the existing candidate submission, trial and promotion owners. Browser tab ownership, chat rendering and Lab qualification are downstream.
Paired document: `C:\Users\osrs_\FluxStuff\!FluxIQWebExtension\docs\working\automation-project-agents-plan.md`
Related: [MVP final month plan](./mvp-final-month-plan.md), [state-aware recovery plan](./state-aware-recovery-plan.md) (C1 Call Subflow, C2 subflow contract, C3 one execution owner per browser resource), [flow version history plan](./flow-version-history-plan.md), [LLM Flow bootstrap architecture](../architecture/automation-studio/llm-flow-bootstrap.md); downstream designs this plan builds on: `mvp-final-month-plan/reports/codex-entry-case-acceptance-design.md` and `codex-held-topology-execution-design.md`

---

## Current State

**Built, qualified and the product default (2026-10-16); now closing its cost gap.** The user asked for "a system of
different agents for managing different parts of a automation project ... the current one we have for actually
building subflows, but that gets spawned by a senior supervisor, much like we have in this repo." Units A1-A6 are
delivered; A8 passed on downstream frozen pair 8 (`project` 10 of 10, `candidate` 9 of 9 run with towels failed) and
`project` became the default authoring mode (t667; an extend still builds `candidate`; `candidate` and `legacy` stay
selectable with `FLUXIQ_AUTHORING_MODE`). The evidence for why is in `Why Now` of the paired document.

**Design (supervisor recommendations, user may overrule):** five roles (project supervisor, subflow builder, repair
agent; validator and promotion owner stay existing services); builders are the candidate authoring loop with a
subflow scope; **Core runs builders concurrently, the domain sets how many** (user, 2026-10-13; the web domain
declares 1); one Flow purse with a reserve for the judged whole run and one repair round; assembly through the
existing submission controller, trial port and promotion; creation ends only on one judged whole-Flow run.

**Cost gap (2026-10-16; plan, findings and units P1-P5 in the paired document's `Cost Gap Plan`).** `project` cost
about 1.6 times `candidate` on pair 8. Two thirds of the gap is finished work thrown away: an unread handed-on value
blocking a brief, and plan amends dropping done proposals; a predecessor's proposal re-doing a later part's act while
Core prepared the entry; the supervisor's guidance teaching splits. Merged: t671 (P1: a narrowing, merge, or act/fact
change carries a done proposal), t672 (P2: an unread handed-on input passes), t673 (P3: asks done on one page are one
subflow), t676 (P4: Core checks a "done before" ending), t677 (an exact first-ask yes flag). Also t679 (P5: a one-part plan's
builder test is the judged whole run) and t683 (the reset reason). Also t684 (in-part acts a reset could not undo) and t685 (one-part tests paid by
the brief). Downstream cost round 1: four of five passed at well under pair 8's calls; towels failed on a judging
defect, fixed by t686-t690. Round 2 passed four of five at $0.031 a build (pair 8 `project` $0.108); social
failed on a false yes over extra rows, fixed by t691-t693. Round 3 running.

**Also done 2026-10-16:** t674 and t681 split `verdict.ts` and `candidate/submission.ts`; t680 audits RegExp
escapes; t682 runs the structure audit before every push.

**Open follow-ups:** A7 (project extend) after
held-topology units 1-4.

**Not claimed:** that agents fix wrong judgements; that the cost fixes lower cost live (no live round yet).

---

## Ownership

| Contract | Owner |
| --- | --- |
| Roles, task spec, structure plan, brief, return, build record | This document |
| Allowances inside the Flow purse, cancellation tree | This document |
| Host-resource scheduler and port (capacity, acquire, release, epoch) | This document |
| Web host capacity (1), leased tab, enforcement on the browser, chat cards, Lab | Paired document |
| Subflow interface, entries, checkpoints, success check | `state-aware-recovery-plan.md` C2 (reused, not restated) |
| Acceptance cases and receipts | Entry-case design / t532 (reused) |
| Whole-topology held execution and settlement | Held-topology design (reused) |

## Role Model

| This repository's agents | Product agents |
| --- | --- |
| Senior supervisor agent | Project supervisor |
| Working document `Current State` | Build record (and its summary for the next supervisor) |
| Worker brief, partitioned by file | Subflow brief, partitioned by subflow |
| Worker owns only its files | Builder writes only its candidate subflow |
| Worker report is a claim | Builder return is a claim; only receipts count |
| Only the supervisor commits | Only the promotion owner writes accepted topology |
| `lab-slots/slot-N`, up to four live lanes at once | Host resources, as many as the domain declares |

The conversation agent (`conversations/commands/`) stays the front door: it
talks to the person and picks a capability (`flow.createHere`,
`flow.improve`, ...). The project supervisor is what that capability now
starts, in place of today's single build loop.

1. **Project supervisor** (model agent, one per build or re-author). Owns:
   - the **task spec**: the task's parts, each quoting the instruction text it
     comes from by source id; the goal facts that would show each part done;
     the lasting acts each part needs; and an explicit "not asked" list (no
     extra filters, columns or exclusions). The spec is a decomposition of the
     instructions, never a new authority (instruction-led rule: model-inferred
     instructions grant nothing);
   - the **structure plan**: the Router rules, the subflows and `part`
     helpers, and the data handoff between them, using the existing plan
     shape (`flow-bootstrap/plan/contracts.ts:141-206`);
   - each subflow's **interface** (C2: inputs, outputs, entries, checkpoints,
     success check);
   - the **case plan**: it reads the owner-declared cases and may propose
     *additional* required cases that cite instruction text; proposals go
     through the case owner's capture, can only add, never remove or waive;
   - **allowances**, **dispatch**, **assembly**, **triage** of failed returns
     and receipts (local repair or re-plan), and the honest ending.
   It gets the opening look and observe-only tools. Deeper reconnaissance is
   a `survey` brief to a builder, so the supervisor's own context stays small.
   It makes no lasting act and authors no subflow body.
2. **Subflow builder** (model agent, one per brief). The candidate authoring
   loop (`flow-bootstrap/candidate/authoring-loop.ts`) scoped to one subflow:
   explores from its prepared entry, submits a scoped subflow proposal,
   tests it from that entry, and returns. Brief kinds: `build`, `survey`
   (returns findings, no proposal).
3. **Repair agent** (model agent). The same engine given a failing receipt
   and the smallest failing unit (`recovery/in-run-repair/unit-contract.ts`
   node, handler or part, or one subflow); returns a held revision of that
   unit. In-run unit repair during a live run stays as it is: it is already a
   bounded worker called only on a true failure. Post-run re-author goes
   through supervisor triage.
4. **Validator** (existing Core services). The trial port
   (`service/candidate-trial/port.ts`, `run.ts`), detached execution with the
   t529 candidate graph source, and the judge
   (`result-verification/build-test/judge.ts`). Writes receipts bound to the
   candidate revision digest (and, once entry-case unit 2 lands, the case).
5. **Promotion owner** (existing). `promoteAutomationStudioCandidateTrial`
   for creation; `settleAutomationStudioRunJudgedReauthor` /
   `settleAutomationStudioRunJudgedPromotions` for re-author; apply under the
   adaptation lock (`reviewFlowBootstrapAdaptation`, `service.ts:1848`).

## Invariants

- **One purse per Flow.** Every call by every role is held against the one
  creation purse (`llm/build-purse/purse.ts`, `creation-purse.ts`). The
  supervisor's allowances are views on it; their sum plus the reserve never
  exceeds the Flow ceiling. Model output is never capped.
- **Context isolation.** A builder sees its brief, its own page views and
  history, nothing of another subflow's. The supervisor sees the task, the
  plan, compact returns and receipts, never a builder's page views. Today the
  evidence array only grows (`llm/evidence-loop.ts:250`); this bounds it by
  construction.
- **Claims are not receipts.** A builder's `complete` names its proposal; it
  never credits a case, a part or a promotion.
- **No agent waives a gate**: instruction authority (`service.ts:1520`),
  permissions (`flow-bootstrap/action-permissions.ts`), instructed-acts
  checklist, required terms, reachability (t531), required cases, base and
  settings freshness, completion only on yes for the exact revision.
- **Creation finishes only on one judged whole-Flow run from the start** on
  the exact assembled revision. Builder subflow trials are partial tests:
  allowed (user rule: test from any node) and never sufficient.
- **One path.** Single-part tasks are one-subflow plans.
- **Carried rules**: four attempts per node; uncertain lasting acts never
  repeated; reset undoes only the build's own acts; recording is evidence;
  general structure; no teaching to the test (supervisor and builder
  guidance examples use a different kind of site); every step reaches the
  chat with its reasoning.

## Contracts

All new types live in a new `runtime/project-agents/` area (one exported
thing per file, a barrel per directory, per `docs/architecture/code-structure.md`).

**Build record** — `project-agents/record/`. The product's working document.
Persisted per Flow build under the Flow directory (`service/paths/flow.ts`)
as the build proceeds, never at the end. Holds: build id, instruction digest
and source ids, task spec revisions, structure plan revisions (each with a
digest), briefs, returns, receipt references (receipts stay with their
candidate owner), the allowance ledger by role and brief, the project-scoped
lasting-act ledger (today's site-reset ledger is per build and unpersisted,
`site-reset/ledger.ts:154`), and a decision log (dispatch, triage, re-plan,
ending, each with its reason). A later supervisor invocation for the same
Flow (improve, re-author) reads the record's summary first, as an agent here
reads `Current State`. Resuming a half-finished build after a Core restart is
post-MVP; the record makes it possible and makes the ending honest now.

**Task spec** — `{ parts: [{ id, quote: { sourceId, text }, goalFacts[],
lastingActs[] }], notAsked[], digest }`. Validation: every quote is a
verbatim span of an active instruction source; every lasting act maps to a
permission the gate already knows. The judge receives the original
instructions and, as a checklist, the parts and `notAsked`.

**Structure plan** — the existing `AutomationStudioFlowBootstrapPlan` shape
with empty subflow bodies (`nodes`/`edges` empty, `interface` and
`fluxiq.successCheck` set), plus `partOf` per subflow naming task-spec parts.
Validated with the existing plan validation and route validation (t531
reachability) before any brief is dispatched. Every part is covered by at
least one subflow; an uncovered part refuses the plan.

**How data crosses subflows (decided 2026-10-13, from t537).** Only through
callable parts, as the script grammar already allows: a subflow that takes
or hands back values has an `interface` and is a `part`, which its builder
writes as `part <key>:` with `input:` and `output: <name> = $step...` lines,
so its outputs are bound. A Router-run subflow has no interface; for a
multi-part task its body is the sequence of `call:` steps the supervisor
writes at assembly, passing each part's outputs to the next by name. A
builder's own helper parts are re-keyed `<subflowKey>-<label>` in its
proposal, so two briefs never collide at assembly.

**Subflow brief** — `{ briefId, kind: build|survey|repair, planDigest,
subflowKey, parts[], interface, entry: { caseId, predecessors[] },
allowanceUsd, maxIterations, permittedActs[], recordingExcerpt?,
failingReceipt? (repair) }`. At most what the builder needs; never the
supervisor's handles (packets may be gone). `permittedActs` is Core's, not the
supervisor's (t570): every lasting act the task spec asks for when any of the
brief's parts acts, none when its parts only read (t575,
`project-agents/contracts/asked-acts.ts`), so a builder's own reading of its
press's class need not agree with the label the supervisor filed.

**Builder return** — `{ briefId, outcome: done|partial|blocked, reason,
proposal?: { subflowKey, revision, digest }, trials: receiptRef[],
interfaceRequest?: { change, why }, findings? (survey), spentUsd, calls }`.
Compact by construction; the supervisor reads this, not the builder's history.

**Allowance** — `purse.allowance({ briefId, role, usd })` returns a view
that holds each call against both its allowance and the Flow purse, records
spend with role and brief attribution, and has its own refusal state (today
`purse.refusal` is one field reset per run, `build-purse/run.ts:45`). The
supervisor's reserve (judged whole run plus one repair round, sized from the
judge's existing reserve pricing) is not allocatable to builders.

**Cancellation** — the supervisor runs inside
`AutomationStudioBuildCancellation.run` for the Flow; each builder is a child
scope with the supervisor's signal as parent (the shape the re-author already
uses, `service.ts:2512`). Person cancel aborts the tree; a builder ending
(allowance spent, stall, blocked) never aborts the supervisor; an in-flight
lasting act keeps the existing uncertain-outcome contract.

**Host resources and concurrency** (user decision, 2026-10-13: concurrent
in Core, the extension sets one at a time). The domain supplies a
host-resource port: `capacity` (how many agents may hold a host resource at
once) and `acquire(holder) -> { resourceKey, epoch } | at_capacity` /
`release(lease)`. Core's scheduler (`project-agents/host-resources/`) grants
leases through that port, queues a brief whose turn has not come, and never
asks for more than `capacity`. A domain that declares more than 1 takes on
the obligation that its resources do not share lasting state (separate
contexts, not tabs of one profile); Core cannot check that, so it is part of
the port's documented contract. The holder is `{ role, briefId }`; every host
command a role issues carries its lease, Core refuses a command from a role
without a current lease, and a released or reissued lease bumps the epoch so
a stale holder's late command is refused downstream too. C3 ("one execution
owner per browser resource") becomes enforced rather than assumed. A builder
that cannot get a lease waits; waiting costs no model calls.

**Concurrent dispatch.** `project.dispatch` takes one or more briefs. Briefs
run at the same time only when neither's entry `predecessors` include the
other's subflow and a lease is available; the rest queue in dependency
order. With capacity 1 this degrades to today's sequential order with no
other change. Every shared structure a concurrent builder touches is
per-brief or serialized by its owner: allowance views, cancellation scopes,
call ids, submission controllers, start-state captures, return files in the
build record (one file per brief, as each worker here writes its own report),
and the lasting-act ledger (one writer, entries attributed by brief).

**Tool scopes** (filtered from the harness option registry,
`harness-options/registry.ts:106`, as `authoring-loop.ts:145` already
filters):

| Tool | Supervisor | Builder | Repair |
| --- | --- | --- | --- |
| opening look, domain observe-only tools | yes | yes | yes |
| `core.run_node` (live acts) | no | yes, permitted acts | yes, unit scope |
| `core.describe_nodes`, `core.recall_result` | yes | yes | yes |
| `project.write_plan` / `project.amend_plan` | yes | no | no |
| `project.dispatch` (runs a brief to its return) | yes | no | no |
| `core.submit_subflow` (scoped proposal) | no | yes | yes |
| `core.test_subflow` (partial trial from prepared entry) | no | yes | yes |
| `project.assemble` (whole candidate via submission controller) | yes | no | no |
| `core.test_candidate` (whole, judged) | yes | no | no |
| `complete` | `{revision,digest}` of a judged-yes whole candidate | its return | its return |

**Scoped submission** — `core.submit_subflow` accepts one subflow body and
any `part` helpers it owns, validates it against its interface in the
current plan digest, and returns a revision and digest from a per-brief
controller. It cannot touch the Router, another subflow, or the interface.

**Subflow trial** — `core.test_subflow` prepares the brief's entry (reset
the build's own acts, then run the named predecessor candidates with the
t529 candidate graph source), observes the entry, runs the one subflow with
its interface inputs, and judges the brief's parts and the subflow's success
check. A partial receipt: useful to the builder and the supervisor, never
credit toward promotion. Detached execution refuses partial runs today
(`verification/detached-execution.ts:53-54`); this adds a separate,
explicitly partial entry rather than loosening that refusal.

**Assembly** — `project.assemble` composes the current plan with each
subflow's latest returned proposal into one complete
`AutomationStudioFlowBootstrapPlan`, submits it through
`AutomationStudioFlowCandidateSubmissionController` (so every existing
completion check runs), and returns the whole revision and digest plus
diagnostics. Creation still requires a blank target Flow (`service.ts:1508`)
and persists the normalized whole topology on apply, unchanged.

## Single-Agent Assumptions To Remove

From the 2026-10-13 Core map; each is assigned to a unit.

| Assumption | Where | Unit |
| --- | --- | --- |
| Opening call id is the constant `initial.<toolId>`; domain keys per-build memory on it | `llm/evidence-loop.ts:531-533` | A4 (prefix with brief id) |
| Model call ids deduplicated only within one loop | `evidence-loop.ts:789` | A4 |
| Submission revisions session-local per controller, unpersisted | `candidate/submission.ts:11-36` | A1 record, A4 |
| Site-reset ledger and start-state diff per build, unpersisted | `authoring-loop.ts:108-116`, `site-reset/ledger.ts:154` | A1, A4 |
| `purse.refusal` single field | `build-purse/run.ts:45` | A2 |
| `cancel(projectId, flowId)` aborts every build on the Flow | `service/flow-bootstrap-commands/cancellation.ts` | A2 (intended: aborts the tree) |
| Per-Flow generation lock; pending adaptation refuses a build | `service.ts:1506,1515` | A5 (supervisor holds the lock for the whole build) |
| No host command serialization in Core | `client-gateway/service/commands.ts:40,84-104` | A3 |
| Provider retry has no jitter: "Core runs one loop against one endpoint" | `llm/provider-retry/limits.ts:36-38` | A2 (jitter when loops share an endpoint) |
| Ambient purse, cancellation, step-log, activity state in AsyncLocalStorage | `build-purse/run.ts:17-53`, `service.ts` | A2/A5 (each builder's chain gets its own scope; tested concurrently) |
| One adaptive run per project; trials open runtime sessions | `service/runtime-session/admission.ts:14-37` | A4 (concurrent subflow trials admitted under the build, not as separate adaptive runs) |
| Node-description memory and build routing per build | `service.ts:1561,1568` | A4 (fresh per builder) |
| Trial-gate verdicts unpersisted | `candidate/trial-gate.ts:177-186` | A1 (receipt refs in record) |

## Units (Core)

Partitioned by file. `service.ts` has one owner at a time (A5 only).

- **A1 Contracts and build record.** New `runtime/project-agents/contracts/`
  and `record/` (types, parsers, digests, store); provider-free tests: task
  spec quote validation, plan coverage of parts, brief/return shape, record
  write-as-you-go and reopen. No wiring. *Ready now.*
- **A2 Allowances and cancellation tree.** `llm/build-purse/` (allowance view,
  per-view refusal, attribution) and `service/flow-bootstrap-commands/cancellation.ts`
  (child scopes). Tests: allowance and Flow purse both refuse; reserve not
  allocatable; child end does not abort parent; person cancel aborts tree;
  two allowance views spending concurrently never exceed the Flow purse and
  refuse independently; provider-retry jitter.
- **A3 Host-resource scheduler (Core half).** New
  `runtime/project-agents/host-resources/`: the domain port contract
  (capacity, acquire, release), the scheduler (grant, queue, epoch, release on
  brief end or cancel), and a stub host for tests. Tests: capacity 2 grants
  two leases and queues a third; capacity 1 serializes; release hands the
  lease on in dependency order; a cancelled waiter never acquires; epoch bump
  marks the old lease stale. The lease field on the host command contract
  (`@fluxiq/contracts`, `client-gateway/service/commands.ts`) is A3b, a
  wire-protocol change paired with downstream W1.
- **A4 Builder scope.** `flow-bootstrap/candidate/` (scoped submission
  controller, subflow trial entry, tool filter by role), brief-id prefixes in
  `llm/evidence-loop.ts`, project-scoped reset ledger in `site-reset/`.
  Depends on A1. Tests: scoped proposal cannot touch Router or siblings;
  subflow trial prepares entry through predecessors with no accepted-graph
  fallback; partial receipt never satisfies `trial-gate` completion.
- **A5 Supervisor loop and wiring.** New `project-agents/supervisor/`
  (loop, `project.*` tools, guidance text) and `project-agents/dispatch/`;
  authoring mode `project` in `model/authoring-mode/`; the one `service.ts`
  integration in `generateFlowBootstrapAdaptationInternal`. Depends on A1, A2,
  A4; A3 before any live run. Tests with stub providers and a stub host of
  capacity 2: two independent briefs run concurrently and a dependent third
  waits; capacity 1 runs all three in order; one-part task gives a
  one-subflow plan; three-part plan dispatches three briefs in dependency
  order; uncovered part refused; builder blocked leads to re-brief or honest
  ending; reserve pays the judged run; Core guard test that guidance mirrors
  no realistic scenario.
- **A6 Activity attribution (Core half).** `agent` field on build activity
  events and the step log (`llm/step-log/`); paired with downstream chat work.
- **A7 Re-author triage.** Supervisor decides local repair brief or re-plan
  for a refuted run; depends on held-topology units 1-4.
- **Follow-ups found while building A1-A6 (2026-10-13).** A9: give the judge
  the task spec's parts and `notAsked` as a checklist beside the instructions
  (`result-verification/`, unowned so far). A10: route a person's answer to the
  asking builder by ask id (`conversations/commands/answer-ask.ts:76-88` takes
  the newest pending ask), needed above capacity 1. A11: the trial start hook
  takes no lease or context, needed above capacity 1. A12: renamed helper parts
  keep their step ids, so two briefs could derive the same dataset id; check at
  assembly. A13: `llm/build-purse/purse.ts` is 476 lines (advisory 400). A14: the dispatcher returns `survey` briefs blocked; implement a survey run (findings, no proposal) or drop the kind.

Interleaving with the Codex queue: entry-case units 2-3 and held-topology
units 1-2 touch `service/candidate-trial/`, `service/runtime-adaptation/` and
`repair-rerun.ts`; A1-A3 touch none of those and can run alongside. A4 shares
`flow-bootstrap/candidate/` with entry-case unit 3 (`trial-gate.ts`) and is
serial with it. A5 and every other `service.ts` change are serial.

## Risks

- **Supervisor overhead on simple tasks.** About five extra small calls.
  Measured in the Lab against `candidate`; if a one-part task costs more than
  today, the supervisor's plan step is shortened, not skipped.
- **Interfaces wrong at plan time.** A builder finds the page does not fit its
  interface. The return's `interfaceRequest` and `project.amend_plan` handle
  it; an amended plan invalidates returns bound to the old digest.
- **Entry preparation cost.** Each subflow trial replays predecessors with no
  model calls, but the site time is real. Bounded by the trial gate's
  existing per-revision trial limit.
- **Supervisor misreads the task.** The task spec makes the misreading
  visible (plan card in the chat) and checkable (quotes must be verbatim), but
  does not prevent it.

## Worker Briefs

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`
unless they start with `docs/` or `packages/`. Each unit runs in its own paired
worktree (`C:/Users/osrs_/FluxStuff/fxwork/t<NNN>/!FluxIQ`); a worker works only
there. Narrow checks only (no full suites): the unit's vitest files from
`packages/fluxiq` (`pnpm.cmd exec vitest run <files>`), `pnpm.cmd --filter fluxiq check`,
`node scripts/structure-audit.mjs` from the Core root, `git diff --check`.

Briefs t533-t539 (units A1, A2, A3, A3b, A4a, A4b, A6) were delivered and moved to
[the archive](./automation-project-agents-plan/archive/2026-10-13-delivered-briefs.md) at the first compaction (2026-10-13).

Briefs A5a, A5b, A5c, the sweep fixture groups, the recording delete retry and the pre-A8 hardening were delivered and moved to
[the archive](./automation-project-agents-plan/archive/2026-10-13-delivered-briefs.md) at the second compaction (2026-10-13).

Briefs A9-A13, A15-A18, A21, A10b, t569 and t570 were delivered and moved to
[the archive](./automation-project-agents-plan/archive/2026-10-14-delivered-briefs.md) at the third compaction (2026-10-14).

### Brief: a8-subflow-trial-setup
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 round one relaunches.
- Task: the bigbox debug (`!FluxIQWebExtension/docs/working/automation-project-agents-plan/reports/a8-bigbox-run-mv8186yr-debug.md`,
  causes A and fix 2; read sections 2, 5 and Recommended fixes 1-2) found every subflow trial ran on the page the builder
  left: `service/subflow-trial/run.ts:71` calls the start hook (which resets the Lab's fixture) and nothing reloads the
  tab or goes to the start; and `subflow-trial-gate.ts:68-103` never undoes the build's lasting acts, unlike
  `flow-bootstrap/candidate/trial-gate.ts:227-229` (the claim at `run.ts:9-10` is wrong). User rule (2026-10-12): before
  every trial and the judged run the site returns to the state the build started from, undoing exactly the build's own
  lasting acts, never what existed before. Fix: (1) a subflow trial starts on a loaded start page (load the build's start
  location in the trial tab after the hook, or a navigate at the head of the throwaway root in
  `flow-bootstrap/verification/detached-subflow.ts` when the run starts the chain); (2) the subflow trial gate undoes the
  build's acts before it runs, as the whole-candidate gate does (site-reset ledger, `startedWith`); correct `run.ts:9-10`.
- Owns: `service/subflow-trial/**`, `flow-bootstrap/verification/detached-subflow.ts`,
  `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`, their tests; report.
- Must not touch: `builder-loop.ts`, `scoped-submission.ts`, `callable-target.ts`, `project-agents/**`,
  `service/project-build/**`, `flow-bootstrap/candidate/**`.
- Definition of done: a stub test where a builder's act changes the site and leaves the tab elsewhere: the next subflow
  trial undoes the act and starts on the loaded start page; whole-candidate trials unchanged; the subflow-trial,
  subflow-candidate, verification and candidate-trial sets; typecheck; audit. No live run.

### Brief: a8-dispatch-waits-for-passing-predecessor
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 round one relaunches.
- Task: bigbox debug cause B (fix 3): `project-agents/dispatch/dispatcher.ts:57` holds a brief back only when its
  predecessor ended `blocked`, but a dependent's trials need a predecessor proposal whose trial answered yes
  (`service/project-build/proposals.ts:33-37`), so six dependent briefs spent $0.055 on 14 trials that all answered
  `subflow.trial_predecessor_missing`. A waiter whose predecessor's return is not `done` with a passing trial does not
  start; it returns `blocked`, naming the predecessor and why.
- Owns: `project-agents/dispatch/dispatcher.ts` and its tests; report. Must not touch: `ending.ts`, `run-brief.ts`,
  `service/**`, `flow-bootstrap/**`.
- Definition of done: stub tests: a predecessor ending partial or done-without-passing-trial holds its dependents
  back with that reason, a passing one releases them, capacity-2 concurrency unchanged; project-agents set; typecheck;
  audit.

### Brief: a8-builder-explores-from-entry
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 round one relaunches.
- Task: bigbox debug fix 8 and an open question. (1) A dependent builder explores from the build's start, not its
  subflow's entry, so every act it explored landed in the wrong state: before a dependent builder's first look, run
  its predecessors' latest passing proposals (the entry preparation subflow trials use, `proposals.ts`), or, where that
  cannot run, tell the builder plainly that its entry is not prepared. (2) brief-4's part had no lasting act, so its
  brief permitted none (t575), yet its `modify_existing` press ran: find why the brief's gate
  (`service/project-build/brief-ports.ts:86-90`) let it through and close it, or show it was correct.
- Owns: `service/project-build/brief-ports.ts`, `service/project-build/proposals.ts`,
  `project-agents/dispatch/run-brief.ts`, their tests; report. Must not touch: `dispatcher.ts`, `ending.ts`,
  `service/subflow-trial/**`, `flow-bootstrap/**`, `llm/**`.
- Definition of done: a stub test where a dependent builder's first look is taken after its predecessor's passing
  proposal ran; a read-only brief's lasting press goes to the person's gate (test); project-build and project-agents
  sets; typecheck; audit.

### Brief: a8-builder-honest-endings
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 round one relaunches.
- Task: bigbox debug cause C and fixes 4, 5, 6, 9. (1) `subflow-trial-gate.ts:43` tells a builder to "complete with
  outcome blocked", but `builder-loop.ts:150,163` allows only `subflowKey`, `revision`, `digest`: add an honest ending
  (`{ ended: "blocked" | "partial", reason }`) and map it to the brief's return; builders get their own wording in place
  of the draft-mode "sent again" text (`llm/decision-handlers/completion.ts:94-97`) through an input, the candidate
  loop's wording byte-identical. (2) A refused callable submission's `previous` returns the probe lines
  (`callable-target.ts:60` -> `scoped-submission.ts:125-130`); return the script the builder sent. (3) Refuse a revision
  that drops its brief's only lasting act. (4) Returns tell the supervisor why (`project-agents/dispatch/ending.ts:38-44`):
  the last trial's code and failing step, or which predecessor's entry was missing.
- Owns: `flow-bootstrap/subflow-candidate/{builder-loop,scoped-submission,callable-target}.ts`,
  `llm/decision-handlers/completion.ts`, `project-agents/dispatch/ending.ts`, their tests; report.
- Must not touch: `subflow-trial-gate.ts`, `dispatcher.ts`, `run-brief.ts`, `service/**`, `flow-bootstrap/candidate/**`.
- Definition of done: stub tests for each item; candidate loop request text byte-identical (existing pins);
  subflow-candidate, decision-handlers, project-agents sets; typecheck; audit.

### Brief: a8-supervisor-plan-checks-and-reset
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 round one relaunches.
- Task: bigbox debug fixes 7 and 10. (1) `project-agents/supervisor/plan-input.ts`: an interface value no later subflow
  takes and nothing the Flow returns uses is refused or warned in the write_plan answer (choose and say why); a part with
  no lasting act whose facts only say what must stay unchanged is a constraint (the not-asked list or the judge's
  checklist), not a subflow of its own; guidance says both, generically. (2) An honest ending that leaves the build's
  lasting acts in place dispatches a reset brief first, or tells the person exactly what is left
  (`project-agents/supervisor/completion.ts`, guidance). Examples from a different kind of site than any realistic
  scenario; keep the guard test.
- Owns: `project-agents/supervisor/**` except `brief-input.ts`, `brief-sizing.ts`; their tests; report.
- Must not touch: `project-agents/dispatch/**`, `service/**`, `flow-bootstrap/**`, `llm/**`.
- Definition of done: stub tests for the two plan checks and for an ending with acts in place; supervisor set;
  typecheck; audit. No live run.

## Work Ledger

Earlier entries are in [the ledger archive](./automation-project-agents-plan/archive/2026-10-13-ledger.md).

Entries from 2026-10-13 to A8 wave 4 (t550-t611) are archived in
[archive/2026-10-15-ledger-2026-10-13-to-wave-4.md](automation-project-agents-plan/archive/2026-10-15-ledger-2026-10-13-to-wave-4.md).

Entries for 2026-10-14 (t613, t617) and 2026-10-15 (A8 waves 5 to frozen pair 5, t619-t655) are archived in
[archive/2026-10-16-ledger-2026-10-14-to-15.md](automation-project-agents-plan/archive/2026-10-16-ledger-2026-10-14-to-15.md).

### 2026-10-16 — After A8 frozen pair 6 wave 32: a done part survives an additive amend (t658); claims weighed by what Core measured (t659); request exclusion words and a playback two-yes hold (t660); not-shown controls route back, trials paid first (t661)
- Agent: read-only debugs of wave 32 (downstream reports `a8-bigbox-cart-run-mvac0ddx-debug.md`, `a8-towels-run-mvac0nmw-debug.md`, `a8-towels-run-mvac1av6-debug.md`); workers t658, t659 (two rounds: the `addedChoice` producer and t660's presence wiring), t660 (partial: its playback hold waits for t662's port), t661 (plus the run detail's `noMatchCause` for the Lab); supervisor partitioned by file, told t659 of the 25-file limit, checked t661 reads t656's `resolution.shown` where the domain puts it (`outputs.result.result.resolution`), verified and integrated
- Changed: t658 `project-agents/supervisor/state.ts`, `dispatch/renamed-outputs.ts`: an amendment that only adds parts or renames outputs carries a done proposal (its builder starts from it and re-tests); the reshape-only warning refused once; repair revisions number after the receipt's. t659 `refuted-no/{missing-claim,unseen-row-claim,advice-condition,label-tested-condition,record}.ts`, `narrowing-group.ts` (`addedChoice`): clause-scoped missing claims, a stored label never missing, link tests are label tests, a no or advice blaming a step that only added a choice with its count unchanged is refuted, a presence condition the request excludes is kept. t660 `refuted-no/request-exclusion-test.ts`, `request-rows/unstated-exclusions.ts`, the loop-verification prompt explains the result count (`automation-studio.loop-verification.v3`, two pins moved), `build-yes-hold/` (inert until t662). t661 `executor/state-routing/{reopen,target-not-shown}.ts`, `service/candidate-trial/{target-on-page,absorbed,interruptions,judging-fits}.ts`, the trial gates, `service/summaries/state-routing.ts` (`noMatchCause`)
- Why: wave 32: a correct towels Flow refuted after playback on a no-op filter claim, a judged-yes part dropped by an additive amend, Core misreadings that wasted the purse, a hidden control described as "step is right, test again"
- Validation: each after merging dev: t658 tsc exit 0, 242 files, 2644 passed; t659 515 files, 5326 passed; t660 330 files, 3073 passed; t661 388 files, 3835 passed; each audit passed and `pnpm check` passed at its finish; merged `2670e8c2`, `d52a1385`, `1a05f4c7`, `ef0b71d7`; pushed
- Outcome: Accepted
- Follow-up: t662 (a saved Flow version records its judged trial so t660's hold can fire); t661's "a layer step N opened" wording is inert while t656 never clears a run-opened layer

### 2026-10-16 — A saved Flow remembers the trial that judged it (t662)
- Agent: worker t662-saved-flow-remembers-its-judged-trial; supervisor accepted the null-parent match and the unverified ending on an unreadable saved Flow, verified and integrated
- Changed: `flow-version/judged-build-trial/` (new): applying a judged-yes revision (`service/flow-bootstrap-commands/applied-parent.ts`, both build paths) records on the parent Flow the trial's run id, yes calls, instruction digest, adaptation id and saved versions; `result-verification/build-yes-hold/saved-flow-trial.ts` and `service.ts` supply `judgedBuildTrial` to the post-playback check, so t660's hold can fire; an unreadable saved Flow after a double no ends `unverified` (`verification_did_not_finish`)
- Why: wave 32 `candidate` towels: a correct Flow refuted after playback on rows two judges had accepted in the build
- Validation: after merging dev: tsc exit 0; result-verification, flow-version, flow-bootstrap/candidate, flow-bootstrap-commands, project-build, candidate-trial, service-bootstrap -> 217 files, 1598 passed; audit passed; `pnpm check` -> passed; merged `a5256b07`; pushed
- Outcome: Accepted. The evidence-guided path has no trial run id and records nothing

### 2026-10-16 — After A8 frozen pair 7 wave 37: kept rows checked before a yes (t663); the playback hold sets aside only nos Core refutes (t664)
- Agent: read-only debug of wave 37 `candidate` towels (downstream report `a8-towels-run-mvahlxuu-debug.md`); workers t663 (two rounds: it fires on build tests, the re-ask wiring, `weighedNos`), t664 (three rounds: the producer moved to t663, a re-asked yes is not confirmed, tests reconciled with the producer); supervisor decided a re-asked yes never holds, verified and integrated in order (t663, then t664)
- Changed: t663 `result-verification/request-rows/{kept-without-asked-column,kept-not-naming-the-item}.ts` (new) and `verdict.ts`: a kept row lacking an asked-for column the others carry, or the item phrase the others write, is flagged under a stated threshold, and a yes not naming it beside a quote of the request is held; `refuted-no/reask.ts`, `recheck-words.ts`, `exclusion-evidence/recheck.ts`: the re-ask says Core's record covers only the rows it names and lists flagged rows; `agreement.ts`, `contracts/verification.ts`: a double no carries `weighedNos`. t664 `result-verification/build-yes-hold/`: holds only where Core contradicts part of each no, never a no that stands whole, a yes confirmed only from two first-ask calls, `buildYesHold {held, because}` recorded and logged; fixed the saved-Flow port refusing every routed playback (the cause it never fired)
- Why: wave 37 `candidate` towels: every yes gate was about left-out rows; a re-ask after Core refuted the nos' wrong reason turned them into a false yes on a kept row that is not the item asked for; t662's hold, had it fired, would have set aside two correct nos
- Validation: t663 after merging dev: tsc exit 0; result-verification, candidate-trial, subflow-trial, flow-bootstrap -> 314 files, 3329 passed, 2 skipped; `pnpm check` -> passed; merged `03311d55`. t664 after merging dev (t663 in): tsc exit 0; result-verification, flow-version, flow-bootstrap-commands, project-build, candidate-trial, subflow-trial -> 179 files, 1358 passed; `pnpm check` -> passed; merged `7c321b7a`; pushed
- Outcome: Accepted
- Follow-up: `result-verification/agreement.ts` is at exactly 800 lines: split it before the next addition; the confirmed-yes rule uses the call count (an exact re-ask flag needs judge.ts, candidate-trial and promotion)

### 2026-10-16 — After A8 frozen pair 8 wave 42: judge text weighed whole, step blame by clause (t665); conditions left out together kept, request-worded filters re-asked (t666)
- Agent: read-only debug of wave 42 `candidate` towels (downstream report `a8-towels-run-mvam0lys-debug.md`: t663 not involved); workers t665, t666 (two rounds: the record, verify and refusal wiring); supervisor kept t641's refuse-once rule (rejected the debug's fix D, a permanent block), kept t651 (no name-test pairs), built both during frozen pair 8 and merged only after wave 46 so the lanes stayed frozen, verified and integrated
- Changed: t665 `llm/harness/provider-result.ts` reads a diagnosis text past its bound whole (`llm_output.diagnosis_text_past_bound`); `refuted-no/{weigh,missing-claim,named-rows,record,types}.ts`: step blame weighed clause by clause, clauses naming no row ignored for the stored-rows test, spelled labels name their row, together rows join the naming pools, "correctly excluded" is no reason; `docs/architecture/automation-studio/llm-flow-bootstrap.md`. t666 `standing-no/{kept-conditions,kept-steps}.ts`, `standing-no-record/record.ts`: conditions that leave rows out only together are kept and refused once; `unsure-doubts/narrowing-no-reask.ts` and `verify.ts`: a no blaming a request-worded filter is re-asked once; `flow-bootstrap/candidate/kept-step-hint.ts`: a one-time hint, never a block
- Why: wave 42 `candidate` towels: revision 3 held the exact rows and was banned by a step-blame sentence that also named a condition; a clipped judge reply was mislabelled; later revisions dropped conditions and a filter on refuted advice
- Validation: t665 after merging dev: tsc exit 0; result-verification, llm, candidate-trial, subflow-trial, flow-bootstrap -> 522 files, 5389 passed, 2 skipped; `pnpm check` -> passed; merged `2599fe17`. t666 after merging dev (t665 in): tsc exit 0; the same plus llm -> 529 files, 5415 passed, 2 skipped; `pnpm check` -> passed; merged `ac1e48a8`; pushed
- Outcome: Accepted

### 2026-10-16 — Project mode is the product default (t667)
- Agent: supervisor (the flip, after A8 frozen pair 8 met the rule); worker t667 (the five tests that assumed the old default)
- Changed: `model/authoring-mode/authoring-mode.ts` `AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT` = `project` and its header; `docs/architecture/automation-studio/llm-flow-bootstrap.md`; tests that checked candidate behaviour set it explicitly, new checks that unset or blank builds create/explore in `project` and an extend still sends `candidate`
- Why: downstream A8 frozen pair 8: `project` 10 of 10 (two consecutive passes on each of five realistic tasks), `candidate` 9 of 9 run with towels failed, `project` about 1.6 times `candidate`'s cost per build
- Validation: after merging dev: tsc exit 0; model, conversations, api, service-bootstrap, flow-bootstrap-commands, project-build -> 130 files, 830 passed; audit passed; `pnpm check` -> passed; merged `7527ae9b`; pushed
- Outcome: Accepted
- Follow-up: the cost gap (a one-part task run as several briefs); t668 splits `result-verification/agreement.ts`

### 2026-10-16 — result-verification/agreement.ts split into agreement/ (t668)
- Agent: worker t668-split-agreement-module; supervisor pointed every comment and the architecture doc at the new directory (not the historical reports or the generated reference), verified and integrated
- Changed: `result-verification/agreement.ts` (800 lines, the hard limit) becomes `result-verification/agreement/` (21 files, the largest 146 lines; the barrel carries the old header and exports only the old names); callers import through the barrel; no behaviour, name or assertion changed
- Why: t663 left the file at exactly 800 lines, so the next judging change would have failed the audit
- Validation: after merging dev (t667 in): tsc exit 0; result-verification, candidate-trial, subflow-trial, flow-bootstrap, llm, model, conversations -> 568 files, 5757 passed, 2 skipped; audit passed; `pnpm check` -> passed; pushed
- Outcome: Accepted

### 2026-10-16 — Cost gap round 1: an unread handed-on input passes (t672); asks on one page are one subflow (t673); verdict.ts split (t674)
- Agent: downstream investigation workers (reports `cost-gap-run-evidence.md`, `cost-gap-core-code.md`,
  `cost-gap-cross-part-act.md`); workers t672 (two rounds: blocked on ownership, then the seam it proposed), t673,
  t674; supervisor reviewed, re-ran the checks, fixed two never-running word checks t673 found, integrated in order
- Changed: t672 `project-agents/dispatch/call-order.ts` (new; assembly's call order and input binding, used by
  `supervisor/assembly.ts` and `dispatch/scope.ts` `handedOn`), `flow-bootstrap/subflow-candidate/{callable-target,
  scoped-submission,contracts,builder-loop}.ts`, `dispatch/ending.ts`: an unread handed-on input passes, `unneeded` on
  the proposal, the answer and the return; an unread person's value is refused, told to read it. t673
  `supervisor/guidance.ts` steps 1-2 and examples (library account, community garden); `guidance.test.ts`'s per-word
  loop removed with a note and `flow-draft/amendment/tests/apply.test.ts`'s pagination check fixed (`\b` in a
  template literal is a backspace; neither ever ran). t674 `result-verification/verdict.ts` -> `verdict/`
- Why: downstream frozen pair 8: `project` $0.977 against `candidate` $0.606 on nine paired runs, $0.248 of the gap
  thrown-away briefs (`run-mvan7giv-4246aafb`: three `subflow.input_unread` refusals, an amend dropping the done work)
- Validation: t672 after merging dev: tsc exit 0; vitest subflow-candidate, project-agents, project-build -> 83 files,
  527 passed. t673: vitest guidance + apply -> 57 passed; check passed. t674: tsc exit 0; vitest result-verification,
  candidate-trial, subflow-trial -> 141 files, 1174 passed. `pnpm task finish` -> `pnpm check` passed for each;
  pushed `f05a486c`
- Outcome: Accepted
- Follow-up: P1 t671, P4 t676, t677 in flight; P5 next; a mechanical check for `\b` in RegExp template literals


### 2026-10-16 — Cost gap round 2: done work carried across amends (t671); a predecessor-did-my-part claim checked (t676); exact first-ask yes flag (t677)
- Agent: workers t671 (two rounds), t676 (two rounds), t677; supervisor reviewed, re-ran, integrated in order
  (t671, t677, t676)
- Changed: t671 `project-agents/amendment/` (new): a done proposal is carried, not done, when an amend only narrows
  its interface, changes its own parts' facts or lasting acts (reverses t595's drop), or merges other parts into it
  (renamed, or turned router-run); `carried-script.ts` rewrites the carried script to fit; `dispatch/run-brief.ts`
  `carriedOf`, `supervisor/dispatch-tool.ts` `carriedOnto`, `contracts/subflow-brief.ts`, `guidance.ts` `AMEND_PLAN`.
  t676 `subflow-candidate/{builder-loop,done-before,brief-words}.ts`, `contracts/builder-return.ts`,
  `dispatch/{scope,ending}.ts`, `service/project-build/{brief-ports,entry-note,subflow-trials,task-checklist}.ts`,
  `service/subflow-trial/`, `result-verification/{build-test,contracts}/task-checklist.ts`: a dependent builder's
  blocked ending before a submission names `doneBefore` (own acting part, an act the preparation run landed), else
  refused (`subflow.done_before_refused`, `subflow.ending_too_soon`); possible acts listed; "end blocked" words only
  for acting parts; `outOfScope` parts named; a possible act reaches the judge as possibly lasting. t677
  `result-verification/first-ask/` (new): `firstAskConfirmed` recorded by `verify.ts`, carried by the judge, the
  candidate trial record, the created audit event and the saved Flow's judged trial; the playback hold reads it, old
  records keep the call count
- Why: downstream cost gap P1 and P4 (`cost-gap-cross-part-act.md`); t677 open since t664
- Validation: t671 after merging dev: tsc exit 0; vitest project-agents, project-build, subflow-candidate -> 87 files,
  546 passed. t677 after merging dev: one project-build expectation of the old trial shape failed, updated; then
  project-build -> 71 passed, and result-verification, candidate-trial, flow-version, project-agents, subflow-trial,
  subflow-candidate passed. t676 after merging dev: tsc exit 0; vitest subflow-candidate, project-agents,
  project-build, subflow-trial, result-verification, candidate-trial -> 233 files, 1758 passed. `pnpm task finish` ->
  `pnpm check` passed for each; pushed
- Outcome: Accepted

### 2026-10-16 — RegExp escapes audited (t680); submission.ts split (t681); pushes run the audit (t682)
- Agent: workers t680, t681; supervisor t682
- Changed: t680 `scripts/structure-audit/rules/regexp-template-escapes.mjs` (new, mirrored downstream): a RegExp
  literal whose string swallows an escape fails the audit. t681 `flow-bootstrap/candidate/submission.ts` 412 -> 292
  lines, flat sibling files (a subdirectory passes the depth limit). t682 `.githooks/pre-push` runs the structure
  audit and refuses a failing push; the root `prepare` script sets `core.hooksPath`; `docs/architecture/
  code-structure.md`
- Why: two checks never ran (`\b` in a template literal); the 400-line advisory; a stale `docs/working/README.md`
  committed straight on dev, here and downstream
- Validation: t680 rule tests 10 pass; audit exit 0 here and downstream; a planted `\b` fails it. t681 after merging
  dev: tsc exit 0; vitest candidate, flow-bootstrap-commands, project-agents -> 79 files, 557 passed. t682
  `sh .githooks/pre-push` -> exit 0 clean, exit 1 with a stale README (also with CRLF line endings). Pushed
- Outcome: Accepted


### 2026-10-16 — One-part plans test once (t679); the reset reason recorded (t683)
- Agent: workers t679 (two rounds), t683; supervisor resolved the `supervisor/dispatch-tool.ts` merge conflict (t679's
  `complete` and t683's `completeAgain` on one answer, both kept: they follow different brief kinds), committed the
  baseline entry t681 removed, integrated
- Changed: t679 `project-agents/single-subflow/` (new), `dispatch/{port,dispatcher,run-brief,types}.ts`,
  `supervisor/{assemble-tool,dispatch-tool,brief-sizing,guidance,whole-trial}.ts`, `subflow-candidate/{builder-loop,
  subflow-trial-gate}.ts`, `service/project-build/run.ts`: on a plan of one router-run subflow the builder's test is
  the judged whole trial of the exact assembled revision, under the supervisor's purse frame, completed on in three
  supervisor decisions; the brief is sized near the whole purse and keeps no judge calls back; the proposals store
  learns single-path trials; old one-part tests moved to the new path or to two-subflow plans. t683
  `supervisor/{state,completion,dispatch-tool,supervisor-loop}.ts`: `resetToEnd` records why a reset was asked for;
  the answer after it says end or `completeAgain`, never test; the t637 fallback stays in memory (no supervisor is
  restarted mid-build), said in the header
- Why: downstream cost gap P5; follow-ups of t637 and t638
- Validation: t679 after merging dev (t683 in): tsc exit 0; vitest project-agents, project-build, subflow-candidate,
  subflow-trial, flow-bootstrap/candidate, candidate-trial -> 150 files, 971 passed. t683: tsc exit 0; vitest
  project-agents, project-build -> 70 files, 465 passed. `pnpm task finish` -> `pnpm check` passed for both; pushed
  `c30a1a32`
- Outcome: Accepted
- Follow-up: t684 (a reset cannot undo an act made inside a part subflow's trial yet says every act is undone; t683's
  three reset gaps), in flight


### 2026-10-16 — A reset undoes in-part acts (t684); one-part tests paid by the brief (t685)
- Agent: workers t684, t685; supervisor fixed one stale dispatch-tool.ts header line, verified, integrated
- Changed: t684 `service/candidate-trial/landed-acts.ts`: a Call Subflow step's page-after showed its child's item, so
  that item counted as seen before and the child's step named nothing; only the call's page-before now counts.
  `dispatch/reset-done.ts` (new): a reset that comes back done names every act still on the site. `supervisor/
  {completion,state,whole-trial,guidance}.ts`: a whole test after a reset ends `resetCameBackLast`; every test clears
  `resetToEnd`; `afterReset`'s t638 branch removed. t685 `llm/build-purse/judge-backstop.ts` (new), `purse.ts`,
  `run-frame.ts`, `single-subflow/single-subflow-trial.ts`, `subflow-candidate/builder-loop.ts`: a single-path judge
  call is paid by the brief's allowance and its top-ups first, held on the build purse (the reserve) only when they
  refuse; the builder's finishing keep is back to 4 calls
- Why: t684 found by t679 moving the reset tests to two subflows; t685 from downstream cost round 1
  (`run-mvblai1v-a31e7593`: the third single-path test refused unaffordable with the reserve spent, ~$0.02 of $0.25 used)
- Validation: t684 after merging dev: tsc exit 0; vitest project-agents, project-build, subflow-trial, candidate-trial,
  subflow-candidate -> 125 files, 804 passed. t685: tsc exit 0; vitest llm, project-agents, project-build,
  flow-bootstrap, candidate-trial, subflow-trial -> 497 files, 4963 passed, 2 skipped. `pnpm task finish` -> `pnpm
  check` passed for both; pushed `d5103343`
- Outcome: Accepted
- Follow-up: downstream cost round 1's towels failure (a false judged yes from the t666 narrowing re-ask; a condition
  in the request's own exclusion words dropped on refuted advice; a result repair that applied nothing): t686-t688


### 2026-10-16 — Judging fixes from downstream cost round 1 (t686-t690)
- Agent: workers t686, t687, t688, t689 (two rounds), t690; supervisor verified, decided t689's inheritance across
  repair briefs of the same subflow, integrated in order
- Changed: t686 `result-verification/agreement/no-reasons.ts` (new): a re-asked answer replaces a no only when every
  reason it gave is the kind its recheck addresses or refuted by Core's record (refuted-no, unstated-exclusion and
  narrowing re-asks); `unsure-doubts/{narrowing,recheck-words,split-facets}.ts`: row names removed before step
  matching; recheck words state what was measured, never "the request itself says" for split one-word options. t687
  `standing-no-record/request-exclusion.ts` (new), `standing-no/{kept-conditions,kept-condition-drop}.ts`,
  `agreement/refuted-labelled.ts`, `candidate-trial/feedback.ts`: a condition in the request's own exclusion words is
  kept until a left-out row the request asks for releases it; wholly refuted advice is not passed on. t688
  `flow-draft/starts-where-it-stands.ts` (new), `llm/node-tools/{dry-run-gate,replay-draft,replay-span}.ts`: the result
  repair starts where it stands, "no next page" ends a page loop, duplicate steps refused. t689 `single-subflow/
  {single-subflow-trial,assembled-from}.ts`, `subflow-candidate/subflow-trial-gate.ts`: the single path carries the
  judged run's kept conditions to the builder (a t679 regression). t690 `flow-draft/scheduled-candidate/step-copy.ts`
  (new): round stalls keep scheduled candidates; the page-loop hint; the builder's read line; `verify.ts` passes the
  record to the narrowing re-ask
- Why: downstream cost round 1 towels (`run-mvblov2i-abb7d82e`): a false judged yes from a re-asked no, a kept
  condition dropped on refuted advice, a result repair that applied nothing
- Validation: after merging dev each: t686 -> 392 files, 3865 passed; t687 -> 396 files, 3882 passed; t688 -> 542
  files, 5702 passed; t689 -> 229 files, 1664 passed; t690 -> 636 files, 6259 passed (the areas each touched, tsc exit
  0 each); `pnpm task finish` -> `pnpm check` passed for each; pushed `807e4ebe`
- Outcome: Accepted


### 2026-10-17 — Extra rows need a reason (t691); a keep-everything read is a doubt (t692); the condition account (t693); feedback split (t694)
- Agent: workers t691 (its converse-ask wiring needed `verify.ts`; the supervisor applied its tested patch as a
  separate commit), t692 (four rounds), t693 (paired with downstream), t694; supervisor verified and integrated
- Changed: t691 `result-verification/request-rows/` (`storedThoughLeftOut`), `agreement/{said,ask-again}.ts`,
  `first-ask/`, `verify.ts`: rows another read stored though a condition left them out need a yes that names them
  with the request's words; the confirming judge call asks the converse (each stored row against the request's words)
  instead of repeating the first. t692 `read-account/kept-every-row.ts` (new) and its wiring through the summary,
  the judge prompt (+ pins), the trial gate and both trial ports: a read with no condition that kept every row after
  an act over a narrower read of the same list is flagged, and each of its rows must be named beside it. t693
  `flow-draft/condition-account.ts`, `llm/repeat-guard/narrowed-nothing.ts`, the draft statement's `conditions`: a
  repair is told which condition kept every row and up to three values it read. t694 `llm/draft-amendment-feedback.ts`
  -> `llm/draft-amendment-feedback/`
- Why: downstream cost round 2 social (`run-mvbr0w7e-6a01c05b`): a final unfiltered read stored 8 rows where the answer
  holds 4, an also-in-result note vouched for the extra rows, the confirming call was an identical temperature-0
  repeat, and a repair resent one condition six times
- Validation: t693 after merging dev: llm, flow-draft, flow-bootstrap -> 429 files, 4633 passed (downstream domain
  1271 passed). t691 after merging dev: result-verification, candidate-trial, subflow-trial, flow-bootstrap,
  project-agents, project-build -> 421 files, 3997 passed. t694: llm, flow-draft, flow-bootstrap -> 4633 passed. t692
  after merging dev: seven directories green but `llm/deepseek/tests/system-prompt.test.ts` (pins), fixed; llm -> 211
  files, 2053 passed. tsc exit 0 each; `pnpm task finish` -> `pnpm check` passed each; pushed `f406dcb4`
- Outcome: Accepted


## Open Questions

- **Schedule against the MVP** (user). Recommendation, acted on in the plan:
  A1-A6 before the 2026-10-29 freeze behind mode `project`, `candidate`
  stays the default; flip only if the Lab comparison passes. Overrule to move
  it after November 10. Outcome: the comparison passed on 2026-10-16 (A8
  frozen pair 8) and `project` is the default (t667).
- **May the supervisor add required starting cases?** (user) Recommendation:
  yes, add-only, each citing instruction text, admitted through the case
  owner. It makes acceptance stricter, never looser.
- **Should the person confirm the plan before builders start?** (user)
  Recommendation: no blocking step; the plan card shows in the chat and the
  person can correct it with a new turn.
- **One model for every role?** (supervisor, settle in A5) Default: same
  provider and model per role, configurable per role.
