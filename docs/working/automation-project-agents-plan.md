# Automation Project Agents Plan

Status: Active
Status detail: A1-A4, A3b, A6 and the paired W1/W2 delivered and pushed 2026-10-13; A5a/A5b in progress; A5c, A7, A8 follow. User decision 2026-10-13: concurrent agents in Core, the extension sets one at a time.
Created: 2026-10-13
Last updated: 2026-10-13
Owner: Senior supervisor agent
Scope: Core's share of FluxIQ's product-level agent system for building an automation: the project supervisor, subflow builder and repair agent roles; the build record, task spec, structure plan, brief, return, allowance, host-resource scheduling and cancellation contracts; per-role tool scopes; assembly through the existing candidate submission, trial and promotion owners. Browser tab ownership, chat rendering and Lab qualification are downstream.
Paired document: `C:\Users\osrs_\FluxStuff\!FluxIQWebExtension\docs\working\automation-project-agents-plan.md`
Related: [MVP final month plan](./mvp-final-month-plan.md), [state-aware recovery plan](./state-aware-recovery-plan.md) (C1 Call Subflow, C2 subflow contract, C3 one execution owner per browser resource), [flow version history plan](./flow-version-history-plan.md), [LLM Flow bootstrap architecture](../architecture/automation-studio/llm-flow-bootstrap.md); downstream designs this plan builds on: `mvp-final-month-plan/reports/codex-entry-case-acceptance-design.md` and `codex-held-topology-execution-design.md`

---

## Current State

**Planned, not built (2026-10-13).** The user asked for "a system of
different agents for managing different parts of a automation project ...
the current one we have for actually building subflows, but that gets spawned
by a senior supervisor, much like we have in this repo." The evidence for why
(context growth from 14.7k to 81.7k tokens per decision in one build, task
parts lost or invented, verification starved by one shared budget) and the
user's words are in the paired document's `Why Now`.

**Design decided (supervisor recommendations, user may overrule):**
- Five roles: project supervisor, subflow builder, repair agent (model
  agents); validator and promotion owner (existing Core services). Roles,
  invariants and contracts below.
- The supervisor replaces the single loop inside
  `generateFlowBootstrapAdaptation` behind a new authoring mode `project`;
  the default stays `candidate` until the Lab shows `project` at least
  matches it. A one-part task is a one-subflow plan, so there is one path.
- Builders are the existing candidate authoring loop with a subflow scope,
  started through the child-build entry the re-author path already uses
  (`service.ts:1495`, called at `:2512`).
- **Core runs builders concurrently; the domain sets how many** (user,
  2026-10-13: "make it possible in core, but have extension set it to only 1
  at a time"). The supervisor dispatches independent briefs at once, up to
  the host capacity the domain declares; the web domain declares 1, so in the
  extension builders run one at a time. Everything in Core is built and
  tested for concurrency (stub hosts with capacity 2), not only for one.
- One Flow purse; the supervisor carves allowances and keeps a reserve for
  the judged whole run and one repair round.
- Assembly produces one complete candidate topology through the existing
  submission controller, trial port and `promoteAutomationStudioCandidateTrial`;
  no new promotion path.

**Depends on, already designed by Codex (not part of this plan):** entry-case
units 2-4 (t532 continuation: prepared-start and trial receipts, accumulator
and promotion gate, site-control preparation) and held-topology units 1-4
(whole-topology held re-author). A multi-part task with only the default
observed-current case does not need them for creation; post-run repair of a
multi-subflow Flow does need held-topology.

**Delivered on dev (2026-10-13, supervisor-verified, pushed):** A1 contracts and build record (t533); A2 allowances, per-run refusal, cancellation tree, retry jitter (t534); A3 host-resource scheduler (t535); A3b + W1 lease stamped on every host command, strict per session, web capacity 1, leased tab (t536, paired); A4a builder scope with bound callable parts and its own wrap-up tools (t537); A4b partial subflow trial, project ledger, trial admission (t538); A6 + W2/W3 agent attribution, project cards, chat lanes, Lab index columns (t539, paired); builder contract, `reset` brief kind and dispatch port (t540). Nothing is wired into `service.ts` yet, so no build behaves differently. **In progress:** A5a supervisor loop and A5b dispatcher (parallel worktrees), and a fix-forward of 42 tests that already failed on Core dev (stale fixtures after t519). **Next:** A5c wiring (`service/project-build/`, authoring mode `project`, net-zero `service.ts` lines), then A8 Lab comparison (paid). Notes for A5: the supervisor's decisions and judge get their own purse run frame; one scheduler per host port; `callScope` only above capacity 1; never start builders through `generateFlowBootstrapAdaptationInternal` (its generation lock is not re-entrant); open trial sessions through `admitAutomationStudioBuildTrialSession`; the whole trial needs a `reset` brief when the project ledger holds acts; `purse.ts` is 476 lines (advisory).

**Not claimed:** that agents fix wrong judgements, that any unit exists, or
that a multi-agent build has run.

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
supervisor's handles (packets may be gone).

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

### Brief: A5a-supervisor
- Repository: FluxIQ Core, its own paired worktree under `fxwork/` (the dispatch prompt names it).
- Task: unit A5a, the project supervisor, in new `project-agents/supervisor/`; no `service.ts` change (A5c wires
  it). (1) `supervisor-loop.ts`: reuse `runAutomationStudioLlmEvidenceLoop` as `flow-bootstrap/candidate/authoring-loop.ts`
  does (filter host tools, append own tools, intercept in `executeTool`, own `completionSchema`/`checkCompletion`)
  with `draft:false, dryRun:false`, NOT `discoveryOnly`, and no `budget` wrap-up (the purse and `maxIterations`
  bound it); its decisions and judge run in their own purse run frame (`llm/build-purse/run.ts`), and inside
  `withAutomationStudioProjectAgent({role:"supervisor"})`. (2) Tools: `project.read_task` carries
  `initialObservation` (the free first look: task, instruction sources, build-record summary; no provider call);
  observe-only domain tools plus `core.describe_nodes`/`core.recall_result` (as `subflow-candidate/role-tools.ts`
  filters); `project.write_plan` (task spec + structure plan into the build record store, refusals returned as
  feedback); `project.amend_plan`; `project.dispatch` (records the briefs, then calls
  `AutomationStudioProjectDispatchPort` from `project-agents/dispatch/port.ts`; `effect:"mutate"` so the repeat
  guard never answers it from memory); `project.assemble`; `core.test_candidate` (reuse
  `AutomationStudioFlowCandidateTrialGate`, `effect:"mutate"`); `complete` only on a yes for the exact assembled
  revision and digest. Before the whole trial, if the project ledger has acts not undone, refuse the trial and
  name `project.dispatch` with a `reset` brief. (3) `assembly.ts`: compose the plan with each subflow's latest
  proposal into one `AutomationStudioFlowBootstrapPlan`: callable subflows are parts; the router-run main
  subflow's body is the sequence of `call:` steps in dependency order, each input bound to the earlier part
  output of the same name; then submit through a new host-composed seam on
  `AutomationStudioFlowCandidateSubmissionController` (`flow-bootstrap/candidate/submission.ts`, e.g.
  `submitComposed`) that runs every completion check except treating the plan as model-written (builders'
  elements were resolved from handles when they submitted). (4) Cards: emit plan, brief, return and receipt
  cards through `activity/project/` at each step. (5) `guidance.ts`: the supervisor's instructions in tool
  descriptions and the read_task answer, examples from a different kind of site than any realistic scenario; a
  guard test copying the lists in `llm/harness/tests/in-run-repair-slot.test.ts:106-125` (do not reuse fixture
  text containing "rating"). (6) `ports.ts`: everything the supervisor reaches outside itself, for A5c to build.
- Required reads: this document's Current State, `Contracts` and the A5 notes there;
  `flow-bootstrap/candidate/{authoring-loop,submission,trial-gate}.ts`; `project-agents/` (all); `activity/project/`;
  `flow-bootstrap/subflow-candidate/`; `docs/architecture/code-structure.md`.
- Owns: new `project-agents/supervisor/` (files above, barrel, `tests/`); the `submitComposed` seam in
  `flow-bootstrap/candidate/submission.ts` and its test; the export line in `project-agents/index.ts`;
  `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: `service.ts`, `project-agents/{contracts,record,host-resources,dispatch,attribution}`,
  every other `flow-bootstrap/` file, `llm/`, `model/`, `api/`, `conversations/`, `activity/`.
- Definition of done (stub provider, stub dispatch port): a one-part task gives a one-subflow plan; a three-part
  plan dispatches briefs in dependency order; an uncovered part refuses; a blocked return leads to a re-brief or
  an honest ending; outstanding acts force a reset brief before the whole trial; the reserve pays the judged run;
  completion only on yes for the exact revision; assembly binds part inputs to earlier outputs and passes the
  composed submission; the guidance guard. Four narrow checks.

### Brief: A5b-dispatcher
- Repository: FluxIQ Core, its own paired worktree under `fxwork/` (the dispatch prompt names it).
- Task: unit A5b, the dispatcher implementing `AutomationStudioProjectDispatchPort` (`project-agents/dispatch/port.ts`)
  in `project-agents/dispatch/`. Dependency order from each brief's `entry.predecessors`; briefs whose entries do
  not depend on each other run at once, up to the host scheduler's capacity; one scheduler per host port (a
  WeakMap), never per build. Per brief: an allowance from the build purse (`purse.allowance`, role `builder`,
  usd and `maxCalls` from the brief), a cancellation child (`buildCancellation.child`), a host lease through
  `AutomationStudioHostLeaseScope` (`project-agents/host-resources/lease-scope.ts`), attribution through
  `withAutomationStudioProjectAgent({role, briefId, subflowName})`; run the builder loop
  (`flow-bootstrap/subflow-candidate/builder-loop.ts`) with a per-brief port factory the caller supplies
  (harness options, routing, permissions, person-needed, the subflow trial port from `service/subflow-trial/`,
  the brief's ledger from the project ledger's `forBrief`); pass a `callScope` only when capacity is above 1.
  A `reset` brief runs the same loop with site-reset tools and completes when the brief's ledger shows every act
  of the build undone (no proposal). Map every ending to an `AutomationStudioProjectBuilderReturn`: a throw, an
  allowance refusal or a stop is `blocked` or `partial` with its reason, never the dispatcher's failure; record
  briefs' returns, allowances and receipts in the build record store. Close each allowance when its brief ends.
- Required reads: this document's Current State, `Contracts` (Concurrent dispatch) and the A5 notes;
  `project-agents/` (all); `flow-bootstrap/subflow-candidate/`; `service/subflow-trial/`; `flow-bootstrap/site-reset/project-ledger.ts`;
  `llm/build-purse/purse.ts` (allowance); `service/flow-bootstrap-commands/cancellation.ts`.
- Owns: new files in `project-agents/dispatch/` (keep `port.ts` as is unless you report why), barrel, `tests/`;
  a shared stub host moved to `project-agents/tests/` if you need it; `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: `service.ts`, `project-agents/{supervisor,contracts,record,host-resources,attribution}`, `llm/`,
  `flow-bootstrap/`, `service/`.
- Definition of done: capacity 2 runs two independent briefs at once and a dependent third waits; capacity 1 runs
  three in order; an allowance refusal or a throwing builder gives a `blocked` return and the rest continue;
  Flow cancel aborts every builder and every waiter; a builder ending never aborts a sibling; callScope only above
  capacity 1; a reset brief completes on a clean ledger; returns and allowances land in the record. Four narrow checks.

### Brief: wiring-tests-active-instructions
- Repository: FluxIQ Core, its own paired worktree under `fxwork/` (the dispatch prompt names it).
- Task: fix forward 42 tests that fail on Core dev before any project-agents work (supervisor reproduced
  2026-10-13 from `packages/fluxiq`: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/service/datasets/tests/service-wiring.test.ts src/programs/automation-studio/runtime/tests/session-recovery/tests/service-wiring.test.ts src/programs/_shared/tests/late-action-result-wiring.test.ts src/programs/automation-studio/client-gateway`
  -> "Failed Tests 42"). The errors are `AutomationInstructionError` ("Write active instructions…", "Describe what
  this recording demonstrates…"), most likely since t519 made Flow-owned written instructions mandatory before a
  run and recordings require a description. Find the change that broke them (git log/bisect on those files'
  subjects), then fix the fixtures: give the Flows active written instructions and describe the recordings the
  way the product now requires. Never relax the product gate to make a test pass. If a failure shows a real
  product defect rather than a stale fixture, stop on that one and report it with the evidence.
- Required reads: the failing files and their helpers; `docs/working/instruction-led-automation-plan.md` Current State.
- Owns: the failing test files and test-only helpers or fixtures under `tests/` directories they use;
  `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: any file outside a `tests/` directory.
- Definition of done: the command above passes in full; `pnpm.cmd --filter fluxiq check`; `node scripts/structure-audit.mjs`;
  `git diff --check`. Report the breaking commit and what each fixture lacked.

### Brief: A5c-wiring
- Repository: FluxIQ Core, its own paired worktree under `fxwork/` (the dispatch prompt names it).
- Task: unit A5c, wire the project supervisor into a real build behind authoring mode `project`; `candidate` stays
  the default. (1) New `service/project-build/`: `runAutomationStudioProjectBuild(ports)` builds the supervisor's
  ports (A5a `project-agents/supervisor/ports.ts`) and the dispatcher's (A5b) from what the candidate branch of
  `generateFlowBootstrapAdaptationInternal` already builds (`service.ts:1504-1609`): shared once per build are the
  activity, cancellation root, project database hold, generation lock, blank-target check, binding, instruction
  authority, provider, loop limits, creation purse, the project ledger (replacing `:1576`), the whole-candidate trial
  port and judge (`:1586-1589`), the draft store and promotion (`:1606-1609`, unchanged); per brief are harness
  options and node descriptions (`:1568`), build routing (`:1561`), the permission gate and person-needed (built
  inside the brief's cancellation child, `:1577-1581`), the subflow trial port (`service/subflow-trial/`), the
  brief's ledger (`forBrief`); trial sessions open through `admitAutomationStudioBuildTrialSession`; one host
  scheduler per host-resources port (`this.hostRuntime?.hostResources`); a new build record store
  (`AutomationStudioProjectBuildRecordStore(this.projectPaths, this.flowPaths)`). Builders are never started
  through `generateFlowBootstrapAdaptationInternal` (its generation lock is not re-entrant). (2) `service.ts`:
  in-place edits only, net zero lines and no packing (it is at its file-lines baseline, 4333): the candidate-only
  tests become candidate-like for `project`, `:1586-1589` move into the new module, and `:1590` becomes the
  ternary between `runAutomationStudioProjectBuild` and `generateAutomationStudioFlowCandidateDraft`. (3) Mode
  `project` through `model/authoring-mode/authoring-mode.ts:28`, `service/flow-bootstrap-commands/{generation-request,contracts}.ts`,
  `api/contracts/adaptation.ts:137`, `api/handlers/llm-generation.ts`, `conversations/commands/build.ts:100,138`
  (chat must send a `project` build, not a legacy one), `flow-bootstrap/action-permissions.ts:311`; refuse
  `project` with `extend` or a repair brief until A7. (4) Export the supervisor from the runtime barrel only if a
  caller outside Core needs it.
- Required reads: this document's Current State and A5 notes; the A5a and A5b reports; the lines named above.
- Owns: the files named above and their tests; `docs/architecture/automation-studio/llm-flow-bootstrap.md` (a
  section on mode `project`); the report.
- Must not touch: `project-agents/**` beyond a barrel export line, `flow-bootstrap/subflow-candidate/**`,
  `service/subflow-trial/**`, `llm/**`, `activity/**`.
- Definition of done: a service-level test with a stub provider (modelled on
  `service/flow-bootstrap-commands/tests/candidate-trial-facade.test.ts`) where a `project` build proposes on a
  judged yes and keeps a draft on no; stub host runtime at capacity 2 and capacity 1; mode parsing and `project`
  refused with `extend`; existing candidate tests unchanged; `node scripts/structure-audit.mjs` shows `service.ts`
  lines unchanged; the four narrow checks.

### Brief: sweep-fixtures-{a,b,c}
- Repository: FluxIQ Core, its own paired worktree under `fxwork/` (the dispatch prompt names it and the group).
- Task: fix forward one group of the 2026-10-13 sweep's failing test files, listed in
  [the sweep record](./automation-project-agents-plan/sweep-2026-10-13.md) (Group A, B or C). Almost every
  failure is a fixture written before t519 (`18ee3f60`): a Flow with no active written instructions, or a
  recording started with no description. Fix them the way t543 did (`automation-project-agents-plan/reports/t543-wiring-tests.md`):
  save the Flow's instructions through the product's own call (`saveFlowGenerationInstruction(...)` or the
  owning equivalent) and describe each recording, per file; do not change a shared helper that other tests rely
  on to be refused. Never relax a product gate. Failures that are not this cause ("Unknown Automation Studio
  Flow" after a refused create is usually the same cause): fix if it is a stale fixture, otherwise stop on that
  test and report it with the evidence.
- Required reads: the sweep record; the t543 report; each failing file and its helpers.
- Owns: the files in your group and test-only helpers under the `tests/` directories they use, if no other
  group's file uses that helper; `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: any file outside a `tests/` directory; another group's files.
- Definition of done: every file in your group passes (`pnpm.cmd exec vitest run <the group's files>` from
  `packages/fluxiq`, contracts built first); `pnpm.cmd --filter fluxiq check`; `node scripts/structure-audit.mjs`;
  `git diff --check`. Report per file what it lacked and any test you stopped on.

## Work Ledger

### 2026-10-13 — Plan written from three discovery reports
- Agent: supervisor
- Changed: this document (new); paired downstream document
- Why: user direction for a supervisor/builder agent system; queued in both `mvp-final-month-plan.md` Current States
- Validation: not validated by tests (planning only); key seams spot-checked in source: `service.ts:1495` child-build signature, `:2512` re-author call, `authoring-loop.ts:145` tool filter, `build-purse/purse.ts` `carriedUsd` and judging reserve
- Outcome: Accepted
- Follow-up: dispatch A1

### 2026-10-13 — Concurrency decision; A1-A3 dispatched
- Agent: supervisor
- Changed: this document (host resources and concurrency, concurrent dispatch, A2/A3/A5 tests, briefs); paired document; both MVP plan paragraphs
- Why: user: "make it possible in core, but have extension set it to only 1 at a time", then "go ahead and work"
- Validation: not validated by tests (planning); `pnpm task start ... --worktree --core` created t533, t534 (observed JSON `"applied":true`)
- Outcome: Accepted
- Follow-up: verify t533-t535 reports and checks

### 2026-10-13 — A3 host-resource scheduler (t535)
- Agent: worker t535-a3-host-resources; supervisor verified and integrated
- Changed: `project-agents/host-resources/` (types, scheduler, errors, stub host, 20 tests)
- Why: user decision, concurrent agents in Core with domain-declared capacity
- Validation: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents/host-resources` -> 20 passed; `pnpm.cmd --filter fluxiq check` -> exit 0; `node scripts/structure-audit.mjs` -> passed; Core `pnpm task finish t535` -> `pnpm check` passed, merged `f606cdbc`
- Outcome: Accepted. Supervisor read the scheduler and kept the port-contract-violation path that does not hand a bad grant back, since releasing it could free another holder's resource
- Follow-up: none

### 2026-10-13 — A1 contracts and build record (t533)
- Agent: worker t533-a1-contracts; supervisor verified and integrated
- Changed: `project-agents/{contracts,record}/`; `project-agents/index.ts` (also exports host-resources)
- Why: unit A1
- Validation: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents` -> 84 passed after merging dev (64 own + 20 A3); check exit 0; structure audit passed; Core finish -> `pnpm check` passed after regenerating the stale working-doc index, merged `d104cbe3`
- Outcome: Accepted. Quotes match exactly (kept strict: the instructions are the authority); the structure plan is validated structurally, not by the plan parser that refuses empty bodies
- Follow-up: none

### 2026-10-13 — A2 allowances, refusal, cancellation, jitter (t534)
- Agent: worker t534-a2-allowances; supervisor verified and integrated
- Changed: `llm/build-purse/` (allowance-book, run-frame, purse, run, harness-hold), `llm/provider-retry/` (endpoint-load, jitter), `service/flow-bootstrap-commands/cancellation.ts`
- Why: unit A2, concurrency-safe budget and cancellation
- Validation: vitest over every test file naming the purse, provider retry or build cancellation -> 35 files, 334 passed; check exit 0; structure audit passed (advisory: `purse.ts` 476 lines); Core finish -> `pnpm check` passed, merged `b6d67d3e`
- Outcome: Accepted
- Follow-up: A5 notes in Current State

### 2026-10-13 — Builder contract, reset brief kind and dispatch port (supervisor; t540)
- Agent: supervisor
- Changed: `flow-bootstrap/subflow-candidate/contracts.ts` (scope, proposal, partial trial result); `project-agents/contracts/subflow-brief.ts` (`reset` kind); `project-agents/dispatch/port.ts`
- Why: shared contracts so A4a/A4b and A5a/A5b could run in parallel; reset brief per the user's site-reset rule
- Validation: `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents` -> 85 passed; check exit 0; structure audit passed (after moving the first contract out of `candidate/subflow/`, which broke the 9-segment depth limit and the barrel-import rule); Core finish `pnpm check` passed, merged `6de291c4`
- Outcome: Accepted
- Follow-up: none

### 2026-10-13 — A3b + W1 host lease on commands, web capacity 1 (t536, paired)
- Agent: workers t536-a3b-lease-core, t536-w1-web-lease; supervisor verified, followed up and integrated
- Changed: Core `client-gateway/service/host-lease/`, `commands.ts`, `command-ledger/dispatch.ts`, `host-resources/lease-scope.ts`, grant `sessionId`; contracts `ClientGatewayHostLease`; downstream `domain/src/runtime/host-resources/` (capacity 1), `domain/src/client/host-lease.ts`, extension `background/connection/host-lease/`, leased tab in `action-runner.ts`
- Why: user decision (concurrent in Core, one at a time in the extension); supervisor follow-up made strict refusal per session (it was process-wide)
- Validation: Core vitest client-gateway + project-agents + composite executor -> 170 passed; contracts test -> 176 passed; check exit 0; audit passed. Downstream after rebuilding Core: domain check and extension check passed; domain tests 29 passed; extension tests 79 passed; structure audit passed; both finishes passed (Core `pnpm check`), merged Core `5fc99fdc` / downstream `d6987262`
- Outcome: Accepted. Not exercised: a live browser; a content-harness stale-holder check (the harness has no background worker)
- Follow-up: merge W1's copy of the session-picking rule with `llm-evidence/tools.ts` `eligibleWebSessionIds`

### 2026-10-13 — A4b partial subflow trial, project ledger, trial admission (t538)
- Agent: worker t538-a4b-partial-trial; supervisor verified and integrated
- Changed: `flow-bootstrap/verification/detached-subflow.ts`; `service/subflow-trial/`; `flow-bootstrap/site-reset/{ledger,project-ledger}.ts`; `service/runtime-session/build-trial-admission.ts`
- Why: unit A4b; a throwaway root of Call Subflow steps runs through the unchanged whole-candidate runner
- Validation: vitest verification, site-reset, subflow-trial, runtime-session, candidate-trial -> 448 passed, 2 skipped (pre-existing skips); after merging dev 388 passed; check exit 0; audit passed; Core finish `pnpm check` passed, merged `2a23fa89`
- Outcome: Accepted
- Follow-up: the start hook takes no lease; settle before raising capacity above 1

### 2026-10-13 — A4a builder scope (t537)
- Agent: worker t537-a4a-builder-scope (two supervisor follow-ups); supervisor verified and integrated
- Changed: `flow-bootstrap/subflow-candidate/` (scoped submission, callable target as a bound part, part re-keying, digest, partial gate, role tools, builder loop); finishing tools as a loop input in `llm/loop-budget.ts` and four one-line spots; opening call id scope in `llm/evidence-loop/call-id.ts`
- Why: unit A4a; follow-ups decided data handoff through bound parts and kept builders' own tools at wrap-up
- Validation: vitest `llm`, `flow-bootstrap/candidate`, `subflow-candidate`, `site-reset` -> 218 files, 2141 passed; after merging dev, `lease-scope.test.ts` failed 4 until the worktree's stale contracts build was rebuilt, then project-agents + client-gateway 235 passed; check exit 0; audit passed; Core finish `pnpm check` passed, merged `1106f30a`
- Outcome: Accepted. Wording nit: the builder's wrap-up still says "submit the whole candidate"
- Follow-up: renamed parts keep their step ids, so two briefs could derive the same dataset id; check at assembly

### 2026-10-13 — A6 + W2/W3 agent attribution and chat (t539, paired)
- Agent: workers t539-a6-attribution-core, t539-w2-chat-attribution; supervisor verified and integrated
- Changed: Core `activity/agent.ts`, `activity/emit.ts` stamp, `activity/project/` cards, step-log role/brief, `project-agents/attribution/`; contracts `ClientGatewayActivityAgent`/`ProjectCard`; downstream chat readers, unit history, per-brief lanes, project messages, Lab index columns
- Why: chat-first rule with several agents
- Validation: after merging dev the typecheck failed on the brief card's missing `reset` wording; supervisor added it and a test; Core vitest activity, step-log, project-agents, client-gateway -> 642 passed; cards 11 passed; contracts 176 passed; audit passed. Downstream: extension tests 536 passed; extension, domain and test-runner checks passed; Lab index test 2 passed; audit passed; both finishes passed, merged Core `6171a526` / downstream `8b36f6e1`
- Outcome: Accepted. Not exercised: side panel and popup rendering in a real browser
- Follow-up: fold modules (card-repeats, retried, done-again) group by unit, not brief; fine at capacity 1

### 2026-10-13 — Compaction
- Agent: supervisor
- Changed: this document; new `automation-project-agents-plan/archive/2026-10-13-delivered-briefs.md`
- Why: the document passed 800 lines and the docs audit failed on dev after the A5c brief was added
- Validation: `node scripts/structure-audit.mjs` -> "structure-audit: passed (348 warning(s), 1156 baselined)." (618 lines after compaction)
- Outcome: Accepted
- Follow-up: none

### 2026-10-13 — Stale wiring fixtures fixed (t543); full Core sweep
- Agent: worker t543-wiring-tests; supervisor verified and integrated; supervisor ran the sweep
- Changed: five test files (instructions saved, recordings described); new sweep record
- Why: 42 tests had failed on dev since t519 (`18ee3f60`); a full sweep then measured the rest
- Validation: the four t543 paths -> 50 passed (was 42 failed); check exit 0; audit passed; merged `1a7d553c`. Sweep on `1a7d553c`: `pnpm.cmd exec vitest run --reporter=dot` -> 66 files / 305 tests failed of 11167, 203 of them the two t519 refusals ([sweep record](./automation-project-agents-plan/sweep-2026-10-13.md))
- Outcome: Accepted (t543); sweep follow-up dispatched as three groups
- Follow-up: sweep-fixtures A, B, C

### 2026-10-13 — A5b dispatcher (t542)
- Agent: worker t542-a5b-dispatcher; supervisor fixed the return contract and integrated
- Changed: `project-agents/dispatch/` (dependencies, scope, lease scope per host port, run-brief, reset loop, endings, receipts); `contracts/builder-return.ts` accepts a done reset without a proposal and refuses a reset that proposes one
- Why: unit A5b
- Validation: `vitest run src/programs/automation-studio/runtime/project-agents` -> 117 passed (reset test unskipped); after merging dev, project-agents + subflow-candidate -> 150 passed; check exit 0; audit exit 0; Core finish `pnpm check` passed, merged `1f747263`
- Outcome: Accepted. Choices recorded: allowance call cap defaults to the brief's `maxIterations` and counts trial judge calls; a brief after a blocked predecessor is not started; the allowance is carved only once the lease is granted
- Follow-up: A14 survey briefs come back blocked without running; implement or drop the kind before the supervisor plans one

## Open Questions

- **Schedule against the MVP** (user). Recommendation, acted on in the plan:
  A1-A6 before the 2026-10-29 freeze behind mode `project`, `candidate`
  stays the default; flip only if the Lab comparison passes. Overrule to move
  it after November 10.
- **May the supervisor add required starting cases?** (user) Recommendation:
  yes, add-only, each citing instruction text, admitted through the case
  owner. It makes acceptance stricter, never looser.
- **Should the person confirm the plan before builders start?** (user)
  Recommendation: no blocking step; the plan card shows in the chat and the
  person can correct it with a new turn.
- **One model for every role?** (supervisor, settle in A5) Default: same
  provider and model per role, configurable per role.
