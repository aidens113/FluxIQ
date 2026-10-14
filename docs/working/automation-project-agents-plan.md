# Automation Project Agents Plan

Status: Active
Status detail: Units A1-A3 in progress in parallel worktrees (t533-t535); A4-A7 follow. User decision 2026-10-13: concurrent agents in Core, the extension sets one at a time.
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

**In progress (2026-10-13, user: "go ahead and work"):** A1 (t533), A2 (t534)
and A3 (t535) dispatched in parallel, each in its own paired worktree under
`fxwork/t<NNN>/`; briefs under `Worker Briefs`. **Next:** verify each, finish
the tasks; then A4 (needs A1) and A6 with downstream W2 (needs A1), W1 (needs
A3); A5 integrates them in `service.ts` under its single owner. The A8 Lab
comparison per the paired document.

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

### Brief: t533-a1-contracts
- Repository: FluxIQ Core, worktree `fxwork/t533/!FluxIQ`, branch `task/t533-project-agents-contracts`
- Task: unit A1. Pure contracts and the build record for the project agents, no wiring:
  role (`supervisor | builder | repair`), task spec (parts with verbatim quote `{sourceId, text}`,
  goal facts, lasting acts, `notAsked`, digest), structure plan (the existing
  `AutomationStudioFlowBootstrapPlan` with empty subflow bodies plus `partOf` per subflow, digest),
  subflow brief, builder return, decision-log entry; parsers that refuse malformed or forged input;
  validators: every quote is a verbatim span of a given active instruction source, every part is
  covered by at least one subflow, brief/return bound to the plan digest; the build record store
  under the Flow directory (`service/paths/flow.ts`), written as the build proceeds: one main file
  owned by the supervisor plus one return file per brief (concurrent builders never share a file),
  reopen after restart. Support concurrent writers of different briefs.
- Required reads: this document's Current State, `Contracts` and `Single-Agent Assumptions` sections;
  `docs/architecture/code-structure.md`; `flow-bootstrap/plan/contracts.ts`;
  `service/candidate-drafts/{record,store}.ts` (pattern to follow); `service/paths/flow.ts`.
- Owns (may edit): new `project-agents/` with `contracts/`, `record/`, their barrels and `tests/`;
  a `project-agents/index.ts` barrel; `docs/working/automation-project-agents-plan/reports/t533-a1-contracts.md`.
- Must not touch: `service.ts`, `llm/`, `flow-bootstrap/` (read only), `client-gateway/`, any other doc.
- Definition of done: tests for each validator and parser (good, malformed, forged, digest changes),
  record write-as-you-go, two briefs' returns written concurrently, reopen; the four narrow checks pass.
- Report to: `docs/working/automation-project-agents-plan/reports/t533-a1-contracts.md`

### Brief: t534-a2-allowances
- Repository: FluxIQ Core, worktree `fxwork/t534/!FluxIQ`, branch `task/t534-project-agents-allowances`
- Task: unit A2, concurrency-safe budget and cancellation. (1) Allowances: today a re-author's build
  purse nests inside the Flow purse and every call is held against both (`llm/build-purse/flow-scope.ts`,
  `harness-hold.ts`). Generalise to a chain: an allowance purse per brief whose parent is the build's
  purse, each call held against every purse in the chain, spend attributed to `{role, briefId}`; an
  allowance can only be carved from what the parent has left minus its judging reserve and minus
  allowances already outstanding. (2) Per-run refusal: `automationStudioLlmBuildPurseRun` resets the
  shared `purse.refusal` at start (`run.ts:45`), so concurrent runs on one purse clobber each other's
  refusal; carry the refusal per run instead, without changing single-run behaviour. (3) Cancellation:
  child scopes in `service/flow-bootstrap-commands/cancellation.ts` (parent signal aborts children; a
  child ending never aborts the parent; Flow cancel aborts the tree). (4) Jitter in provider retry
  (`llm/provider-retry/limits.ts` notes "one loop against one endpoint").
- Required reads: this document's Current State, `Contracts` (Allowance, Cancellation) and
  `Single-Agent Assumptions`; `llm/build-purse/*.ts`; the cancellation file; `llm/provider-retry/`.
- Owns (may edit): `llm/build-purse/` and its `tests/`; `service/flow-bootstrap-commands/cancellation.ts`
  and its test; `llm/provider-retry/` and its `tests/`; `docs/working/automation-project-agents-plan/reports/t534-a2-allowances.md`.
- Must not touch: `service.ts`, `project-agents/`, `client-gateway/`, any other doc.
- Definition of done: existing purse, flow-scope, cancellation and retry tests still pass unchanged
  in meaning; new tests: chain holds and refuses at either level; reserve not allocatable; two
  allowances spending concurrently never exceed the parent and refuse independently; concurrent
  runs keep separate refusals; tree cancel; jitter bounds. The four narrow checks pass.
- Report to: `docs/working/automation-project-agents-plan/reports/t534-a2-allowances.md`

### Brief: t535-a3-host-resources
- Repository: FluxIQ Core, worktree `fxwork/t535/!FluxIQ`, branch `task/t535-project-agents-host-resources`
- Task: unit A3, the domain-neutral host-resource scheduler (user, 2026-10-13: concurrent agents
  possible in Core; the extension sets one at a time). A port the domain implements:
  `capacity` and `acquire(holder) -> { resourceKey, epoch } | "at_capacity"`, `release(lease)`; holder
  is `{ role: string; briefId: string }`. A scheduler that grants at most `capacity` leases, queues
  waiters FIFO (the dispatcher will enqueue in dependency order), retries a waiter when a lease is
  released, removes a waiter whose signal aborts (it never acquires), releases on holder end, and
  answers `isCurrent(lease)` / `assertCurrent(lease)` with epochs so a released or reissued lease is
  stale. A stub host for tests with configurable capacity. Document the port's obligation: a domain
  declaring capacity above 1 guarantees its resources share no lasting state.
- Required reads: this document's Current State, `Contracts` (`Host resources and concurrency`,
  `Concurrent dispatch`); `docs/architecture/code-structure.md`.
- Owns (may edit): new `project-agents/host-resources/` with barrel and `tests/` (do not create
  `project-agents/index.ts`; t533 owns it); `docs/working/automation-project-agents-plan/reports/t535-a3-host-resources.md`.
- Must not touch: `service.ts`, `client-gateway/`, `packages/contracts`, everything outside the owned dir.
- Definition of done: tests: capacity 2 grants two and queues a third; capacity 1 serializes; FIFO
  hand-off on release; aborted waiter never acquires; port returning `at_capacity` below capacity
  waits; stale epoch after release; double release harmless. The four narrow checks pass.
- Report to: `docs/working/automation-project-agents-plan/reports/t535-a3-host-resources.md`

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
