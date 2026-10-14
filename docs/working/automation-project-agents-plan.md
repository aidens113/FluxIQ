# Automation Project Agents Plan

Status: Active
Status detail: A1-A6 with W1-W4 delivered and pushed 2026-10-13 (mode project opt-in); hardening before A8 in progress; A7 and A8 follow. User decision 2026-10-13: concurrent agents in Core, the extension sets one at a time.
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

**Delivered on dev (2026-10-13, supervisor-verified, pushed):** every unit A1-A6 with W1-W4: contracts and build record, allowances and cancellation tree, host-resource scheduler and lease on every command (web capacity 1), builder scope and partial subflow trial, agent attribution and chat cards, the project supervisor, the dispatcher, and the wiring: a build in authoring mode `project` runs the supervisor and its builders; `candidate` stays the default, so ordinary builds are unchanged. Also merged today: the fix-forward of every failure the two sweeps found (Core 305, downstream 31), a product fix for instructions leaking across Flows, and bounded retries on recording directory removal; the confirming Core sweep had one failure of 11207, since fixed. **Also merged:** the pre-A8 hardening (a refused act ends its builder; promotion reads every brief's answers; the reserve covers the judged run and one repair round; builder acts are placed so a reset can undo an Add to cart; every act in the build record), the judge checklist (A9), distinct ids in assembled Flows (A12), and the follow-ups A10, A11, A13, A15-A18. **Ready, awaiting the user's go-ahead:** A8 Lab comparison (nine paid runs, at most $2.25, about 1.5-2 hours; plan in the paired document). **Next otherwise:** A21, A10b, W8, then A7 re-author triage and A14 surveys, informed by A8.

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

Briefs A5a, A5b, A5c, the sweep fixture groups, the recording delete retry and the pre-A8 hardening were delivered and moved to
[the archive](./automation-project-agents-plan/archive/2026-10-13-delivered-briefs.md) at the second compaction (2026-10-13).

### Brief: A9-judge-task-checklist
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Lands before A8.
- Task: in mode `project`, the judge receives the task spec's parts and `notAsked` list as a checklist beside the
  original instructions (plan: Contracts, Task spec). The instructions stay the only authority: the checklist is a
  clearly labelled supplementary section saying what the instructions ask, part by part, and what they do not ask,
  so a result that adds a filter, column or exclusion nobody asked for is judged against it. Add an optional
  checklist input to the build-test judge (`result-verification/build-test/judge.ts` and the prompt it builds);
  without one the judge's request is byte-identical to today's (candidate mode unchanged). Build it from the build
  record's latest task spec for the whole trial (`service/project-build/whole-trials.ts`) and from the brief's parts
  for a subflow trial (`service/project-build/subflow-trials.ts`). Never mirror a realistic scenario in any example
  or wording (copy the guard lists from `llm/harness/tests/in-run-repair-slot.test.ts:106-125` into your test).
- Owns: the judge and its prompt assembly under `result-verification/build-test/`, the two project-build files,
  their tests; report.
- Must not touch: `service.ts`, `project-agents/**`, `flow-bootstrap/**`, `llm/**`.
- Definition of done: judge request unchanged without a checklist (byte comparison); with one, both lists present
  and labelled as subordinate to the instructions; whole and subflow trials pass it; guard test; narrow checks.

### Brief: A12-assembly-dataset-ids
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Lands before A8.
- Task: a builder's helper parts are re-keyed `<subflowKey>-<label>` (`flow-bootstrap/subflow-candidate/part-keys.ts`)
  but keep their step ids (`narrow-s1`), so two briefs could derive the same dataset id or step id in the assembled
  Flow. Make the re-keying also make step ids (and whatever dataset ids derive from) unique per subflow, and make
  `project-agents/supervisor/assembly.ts` refuse an assembled plan with a duplicate step id or dataset id across
  subflows, naming both briefs. Find first how dataset ids are derived (grep the read-list/dataset owner).
- Owns: `flow-bootstrap/subflow-candidate/part-keys.ts`, `project-agents/supervisor/assembly.ts`, their tests; report.
- Must not touch: `service.ts`, `service/project-build/**`, `result-verification/**`.
- Definition of done: two briefs whose builders both name a helper `narrow` with a read step assemble into a plan
  with distinct step and dataset ids; a forced duplicate is refused at assembly; existing subflow-candidate and
  supervisor tests pass; narrow checks.

### Brief: A10-A11-ask-routing-and-start-hook-lease
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Needed above capacity 1.
- Task: (A10) `conversations/commands/answer-ask.ts:76-88` resolves an answer without an ask id to the newest pending
  ask, so with two builders asking at once an answer can land on the wrong one. When more than one ask is pending
  in the thread, an answer must name its ask id, or it is refused with a message that names the open asks; one
  pending ask keeps today's behaviour. (A11) The trial start hook (`prepareStart`, `service/candidate-trial/contracts.ts`
  and its uses in `service/candidate-trial/` and `service/subflow-trial/`) takes no lease, so above capacity 1 a
  site reset could act outside the holder's resource. Pass the holder's lease, when there is one, to the hook, and
  document that a domain's hook resets only that resource; no lease keeps today's behaviour.
- Owns: the files named and their tests; report.
- Must not touch: `service.ts`, `project-agents/**`, `service/project-build/**`.
- Definition of done: tests for both, including unchanged single-ask and no-lease paths; narrow checks.

### Brief: A13-build-purse-split
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: `llm/build-purse/purse.ts` grew to 476 lines (advisory 400) with t534's allowances. Split it by
  responsibility (holds and settlement, refusal, judging reserve, allowance carving) into focused files in the same
  directory, one exported thing per file, the barrel unchanged for callers. Behaviour-preserving: no test changes
  except imports; never extract-and-drop.
- Owns: `llm/build-purse/**`; report. Must not touch: anything outside it.
- Definition of done: every test that names the purse passes unchanged in meaning (grep `build-purse|BuildPurse`);
  `purse.ts` under 400 lines; narrow checks.

### Brief: A15-A18-core-retired-paths-cleanup
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: four leftovers the sweeps found. (A17) `createDefaultFlow` makes owner-bound Flows that can never hold
  instructions, so they can never run; only tests call it: retire it and move its tests to canonical Flows. (A16)
  `storage_required` cannot be reached through `runRuntimeSession` for a run with no project: remove the dead branch
  or report why it must stay. (A18) SQL stores `adaptation_review` scopes as `flow` and `on_error` as `error`, unlike
  the summary index: make both paths answer the same at their boundary (a mapping, no stored-data change), and
  extend `runtime/service/summaries/tests/instruction-scope-parity.test.ts`. (A15) A build refused for missing
  instructions no longer carries the Flow Bootstrap diagnostic (stage, provider fields): find every caller that
  classifies build failures by it (Core and the downstream Lab: grep both), and restore the fields on that refusal
  if any does.
- Owns: the files these touch, `runtime/service.ts` in place (lines may only go down), their tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `llm/build-purse/**`, `result-verification/**`.
- Definition of done: tests beside each change; narrow checks; the report lists each item's outcome.

### Brief: A21-instruction-scope-write-error
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: t558 found that an instruction whose scope names a node not in `graph_nodes` is silently left out of project
  SQL: the write's error is swallowed (`runtime/service.ts` ~3249), so a SQL listing omits an instruction the summary
  index still lists. Find why the write fails (a foreign key to `graph_nodes`?) and make the two stores agree without
  swallowing anything: either the save refuses a scope that names no node of the Flow, with a clear error, or the
  scope is stored so that it does not depend on the node row; choose by what the instruction scope contract says
  (`docs/architecture/automation-studio/`), and say why. Extend the parity test
  (`runtime/service/summaries/tests/instruction-scope-parity.test.ts`) with this case.
- Owns: the write path you find, `runtime/service.ts` in place (lines may only go down), the store's tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `conversations/**`.
- Definition of done: no swallowed write; parity holds for a node-scoped instruction; tests beside each change; narrow checks.

### Brief: A10b-chat-sees-ask-ids
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: since t556 a typed answer that names no ask is refused when more than one ask waits, but Core's chat model
  never sees ask ids, so it can never name one and a typed answer can settle neither. Give the chat model the waiting
  asks with their ids in its own context (the conversation's model context, not the thread), so its answer command
  can name the ask the person meant, and say in its guidance how to choose. The person still never sees an id
  (t276: no codes in the thread). Guidance examples use a different kind of site than any realistic scenario.
- Owns: the conversation model context and guidance under `runtime/conversations/` and their tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `runtime/service.ts`.
- Definition of done: with two asks waiting, a stub chat model that reads the context names the right ask and the answer
  settles it; one waiting ask behaves as before; no id appears in any thread text (test); narrow checks.

### Brief: supervisor-plans-not-explores
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 resumes.
- Task: the first live `project` build (run-mv7t07hx-fe96a174, crossborder, 18 steps, $0.0056; steps in
  `C:/Users/osrs_/FluxStuff/lab-runs/2026-10-14/run-mv7t07hx-fe96a174/steps/`) ended
  `flow_bootstrap.evidence_repeat_without_progress` / `llm_evidence_loop.searching_without_acting` after the supervisor
  read the task and then made 7 `web.find_on_page` calls and one `web.describe_element` without ever writing a plan.
  Its own reasons show it trying to explore like a builder ("I'll type Voltbay into the site's search box (t8)") with
  only observe tools, using `find_on_page` (one query was just "field") as a stand-in for acting. Fix the supervisor
  so it plans from a short look and leaves exploring and acting to builders: (1) guidance
  (`project-agents/supervisor/guidance.ts`, the `project.read_task` answer and the tool descriptions) states its role
  plainly: it does not operate the site; after the task and at most a couple of looks at the current page it writes
  the task spec and structure plan, and a part it cannot see from the start page is a builder's to find; examples
  from a different kind of site than any realistic scenario (keep the guard test); (2) a look budget: after a small
  number of observe calls (choose and justify, about 3) the observe tools are withdrawn through the loop's existing
  look withdrawal (`llm/decision-handlers/look-withdrawal.ts` and its input) so only planning, dispatch, assembly and
  test remain; (3) the stall redirect and the searching-without-acting feedback, when they reach the supervisor,
  name `project.write_plan` (or the next planning step) as the way forward, through the loop's finishing-tools style
  input t537 added, not supervisor-specific branches in `llm/`; the candidate loop's wording stays byte-identical.
- Second defect, from run-mv7t19hg-1d51f430 (bigbox, steps 0025-0034): after the same over-looking the supervisor
  wrote an excellent task spec (verbatim quotes, goal facts, a sound not-asked list) but every `project.write_plan`
  was refused (`structurePlan.plan.router` missing, then `subflows.0.callable` unknown): it is asked to write Core's
  raw `AutomationStudioFlowBootstrapPlan` (router rules, interface ports `{id, name, valueType}`, structured success
  checks) and guesses. (4) Give the supervisor a planning format it can write and Core compiles
  (`project-agents/supervisor/plan-input.ts`, `plan-tool.ts` input schema and description): `subflows: [{ key, name,
  purpose, parts: [partId], inputs: [name], outputs: [name], after: [key] }]` and nothing else. Core builds the
  structure plan from it: one subflow with no inputs and outputs is the router-run subflow itself; several become
  callable parts with interfaces built from their names, the router-run body is composed at assembly as now, `partOf`
  from `parts`, entry predecessors from `after`; a success check is the builder's to propose, not the supervisor's.
  Refusals name the planning format's own fields. Keep the raw plan path out of the model's reach.
- Required reads: the run's steps (request/response of 0003, 0011, 0017, and the last), `project-agents/supervisor/`,
  `llm/evidence-progress/stall-redirect.ts`, `llm/decision-handlers/look-withdrawal.ts`, `llm/loop-budget.ts`.
- Owns: `project-agents/supervisor/**`; the inputs and wording paths in `llm/evidence-progress/`, `llm/decision-handlers/look-withdrawal.ts`,
  `llm/loop-configuration.ts` needed for (2)-(3), each with tests; report.
- Must not touch: `service.ts`, `service/project-build/**` (unless one line to pass the new input; say so), `flow-bootstrap/**`.
- Definition of done: a stub-provider test with the planning format (one-part and three-part tasks) gives valid structure plans and dispatches; a stub-provider test replaying the crossborder run's shape (a supervisor that searches repeatedly) gets
  the look tools withdrawn after the budget and a redirect naming the plan, and a stub that then writes the plan
  proceeds to dispatch; candidate loop tests unchanged; the guidance guard test; narrow checks. No live run.

### Brief: project-calls-and-brief-defaults
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 resumes.
- Task: A8 round 1 after t569 (run-mv7vk3ol-9e11b266 crossborder, run-mv7vl89u-917d62a6 bigbox; steps under
  `C:/Users/osrs_/FluxStuff/lab-runs/2026-10-14/`): the supervisor now plans and dispatches, and builders act, but
  both builds ended `flow_bootstrap.run_budget_calls_exhausted` at about $0.07-0.08 of $0.25, bigbox before any
  builder submitted. (1) Calls: an allowance reserves dollars but not calls (t534 open question), so one builder
  spends the run's calls and its own wrap-up never triggers. Carve each brief's call cap from the parent purse's
  remaining calls the way dollars are carved (never from what assembly, the whole trial and judging keep back), and
  have the builder loop's wrap-up and budget notes read its own allowance, so a builder submits before its share
  ends (`llm/build-purse/` allowance book, `service/project-build/` where allowances and loop limits are set,
  `flow-bootstrap/subflow-candidate/builder-loop.ts`). (2) Core sizes briefs: when the supervisor gives no
  `allowanceUsd`/calls, split what can still be given out over the briefs being sent and those the plan has not yet
  dispatched; the supervisor may still lower one; `project.allowance_unavailable` should no longer be reachable by
  guessing (it was hit twice). (3) Core derives each brief's `permittedActs` from its parts' lasting acts
  (`project.brief_act_not_asked` was hit three times); the supervisor no longer writes them. (4) A builder's brief
  shows the exact `input:` and `output:` lines its part must declare, by name (`subflow.interface_input_mismatch`:
  "collect_coupon is given exactly itemUrl; this part declares no value").
- Required reads: the two runs' steps (supervisor dispatch calls and results, the builder refusals), the Core plan's
  Contracts (Allowance), `llm/build-purse/`, `service/project-build/`, `project-agents/{supervisor,dispatch}/`,
  `flow-bootstrap/subflow-candidate/builder-loop.ts`.
- Owns: the files named and their tests; `project-agents/contracts/subflow-brief.ts` if a field becomes optional; report.
- Must not touch: `service.ts` beyond one in-place line if unavoidable (say so); `flow-bootstrap/candidate/**`.
- Definition of done: a stub test where three builders share a 64-call build: each gets a call share, each wraps up and
  submits within it, and calls remain for assembly and the whole trial; briefs sent without allowances get sizes that
  fit; permitted acts come from parts; the brief shows interface lines; candidate builds' purse behaviour unchanged.
  The whole project-agents, project-build, build-purse, subflow-candidate sets; check; audit. No live run.

## Work Ledger

Earlier entries are in [the ledger archive](./automation-project-agents-plan/archive/2026-10-13-ledger.md).

### 2026-10-13 — Recording directory removal retries (t550)
- Agent: worker t550-recording-delete-retry; supervisor verified and integrated
- Changed: new `service/recordings/directory-removal.ts` (`removePathWithRetry`: EPERM, EBUSY, EACCES, ENOTEMPTY, six retries, about 0.8 s, then the last error); `recordings/{deletion,store,index}.ts`, `object-documents.ts`
- Why: the confirming sweep's one failure, a recording batch delete hitting EPERM under load
- Validation: vitest `service/recordings`, `tests/service-recordings`, `object-documents` -> 16 files, 129 passed; after merging dev 128 passed; check exit 0; audit exit 0 (one baseline entry lowered); Core finish `pnpm check` passed, merged `26ee74d2`
- Outcome: Accepted
- Follow-up: `service.ts` `deleteRecording` still calls `rm` without the retry (in project-build-hardening)

### 2026-10-13 — A5c wiring and W4 Lab support (t549, paired)
- Agent: workers t549-a5c-wiring, t549-w4-lab-project-mode (each with a supervisor follow-up); supervisor verified and integrated
- Changed: Core `service/project-build/` (16 files), in-place `service.ts` edits (20 lines, still 4333), mode `project` through generation request, API, chat build, permissions; downstream Lab readiness, outcome reading, start hook, per-role spend in the run snapshot
- Why: units A5c and W4: a build in mode `project` runs the supervisor and the real dispatcher; `candidate` stays the default
- Validation: Core vitest over project-build, flow-bootstrap-commands, llm-generation, conversations commands, project-agents, flow-bootstrap, authoring-mode, service-bootstrap -> 236 files, 2657 passed, 2 skipped (pre-existing); check exit 0; audit exit 0; after merging dev, project-build + project-agents + recordings -> 236 passed. Downstream after rebuilding Core: test-runner check passed; readiness, draft, spend, lane, chat, environment, mode tests -> 65 passed; both finishes passed, merged Core `f15acaff` / downstream `c966d3cc`
- Outcome: Accepted, opt-in. Not exercised: a live run, the web domain's real host port, a reset brief end to end through the service
- Follow-up: project-build-hardening before A8 (builder permission endings, permission outcome at promotion, repair-round reserve, reset end to end, `deleteRecording` retry, ledger acts in the build record)

### 2026-10-13 — Pre-A8 hardening (t551); W6 lab key scope (t553, downstream)
- Agent: workers t551-project-build-hardening (one supervisor follow-up), t553-w6-key-scope; supervisor verified and integrated
- Changed: Core `project-agents/dispatch/run-brief.ts` (a permission ending ends the builder's loop), `service/project-build/{permissions,reserve,acts-record,brief-ports,reset-calls,whole-trials,run}.ts`, `project-agents/record/` (every act with owner and class), in-place `service.ts` (still 4333 lines); downstream: `FLUXIQ_PROVIDER_KEY_FILES=none`, a test fence on env files, dead recorded-Flow code removed
- Why: close A5c's gaps before any paid run; a probe had read the real key under `FLUXIQ_TEST_ENV_FILES=none`
- Validation: Core vitest project-agents, project-build, recordings, build-purse, site-reset, flow-bootstrap-commands, candidate-trial, subflow-trial -> 86 files, 641 passed (the cart reset test fails with placement disabled); check, audit, diff clean; merged `0f8ca572`. Downstream test-runner -> 835 passed, 5 skipped; Lab scripts -> 202 passed, 0 failed; audit passed with two baseline entries removed; merged `bede01bf`
- Outcome: Accepted
- Follow-up: A9 and A12 before A8; A10-A11, A13, A15-A18, W7 alongside

### 2026-10-13 — Second compaction
- Agent: supervisor
- Changed: this document; archive files `2026-10-13-delivered-briefs.md` (appended) and `2026-10-13-ledger.md` (new)
- Why: the document passed 800 lines (819) and the ledger passed 20 entries
- Validation: `node scripts/structure-audit.mjs` -> see the docs commit carrying this entry (the commit helper refuses to commit on a failed audit)
- Outcome: Accepted
- Follow-up: none

### 2026-10-13 — Follow-ups A9-A13, A15-A18 and W7 (t554-t559)
- Agent: workers t554-a9-judge-checklist, t555-a12-dataset-ids, t556-a10-a11, t557-a13-purse-split, t558-a15-a18 (Core), t559-w7-bench (downstream), several with a supervisor follow-up; supervisor verified each and integrated
- Changed: A9 the project build's judges read the task spec's parts and not-asked list beside the instructions (candidate requests byte-identical); A12 builders' helper parts and router-run entries get distinct step and dataset ids, assembly refuses a shared one; A10 with several asks waiting a typed answer naming none is refused, naming each ask by its words; A11 the start hook gets the holder's lease; A13 `purse.ts` 476 -> 308 lines; A15 the missing-instructions refusal is `flow_bootstrap.active_instructions_required` again with its diagnostic; A16 `storage_required` kept with a test of why; A17 `createDefaultFlow` retired (`service.ts` 4333 -> 4318); A18 SQL and the index agree on scope kinds; W7 the bench's recorded-Flow evaluation, `week2`, `flowLaneExclusion` and declared repair removed
- Why: the follow-ups recorded through the day; A9 and A12 had to land before A8
- Validation: Core, after merging dev: result-verification + project-build + project-agents -> 776 passed; subflow-candidate + project-agents + project-build -> 203 passed; conversations commands + candidate-trial + subflow-trial -> 278 passed; every purse test file -> 298 passed; summaries + service-flows + service-bootstrap -> 301 passed; check and audit exit 0 each; merged `b97ebae0`, `caf286d4`, `adf63a5e`, `e8e94d03`, `98df1e07`. Downstream: test-runner -> 1182 passed; test-contracts -> 169 passed; checks and audit passed; merged `148262f1`
- Outcome: Accepted. A8 is ready; it needs the user's go-ahead
- Follow-up: A21 an instruction scoped to a node missing from `graph_nodes` is silently left out of project SQL (the write's error is swallowed, `service.ts` ~3249); A10b the chat model never sees ask ids, so with two asks waiting a typed answer cannot settle either; W8 `scenario-lab` identity-drift `repair.ts` is orphaned, `gate.ts` `declaredRepair` is dead, six stale comments (`reports/t559-w7-bench.md`)

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
