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

**Built; A8 Lab comparison running (2026-10-14).** The user asked for "a system of
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

**Delivered on dev (2026-10-13, supervisor-verified, pushed):** every unit A1-A6 with W1-W4: contracts and build record, allowances and cancellation tree, host-resource scheduler and lease on every command (web capacity 1), builder scope and partial subflow trial, agent attribution and chat cards, the project supervisor, the dispatcher, and the wiring: a build in authoring mode `project` runs the supervisor and its builders; `candidate` stays the default, so ordinary builds are unchanged. Also merged today: the fix-forward of every failure the two sweeps found (Core 305, downstream 31), a product fix for instructions leaking across Flows, and bounded retries on recording directory removal; the confirming Core sweep had one failure of 11207, since fixed. **Also merged:** the pre-A8 hardening (a refused act ends its builder; promotion reads every brief's answers; the reserve covers the judged run and one repair round; builder acts are placed so a reset can undo an Add to cart; every act in the build record), the judge checklist (A9), distinct ids in assembled Flows (A12), and the follow-ups A10, A11, A13, A15-A18. **Now (2026-10-14):** A8 is running on the user's go-ahead ("Yes go to live tests"); its attempts are in the paired document's A8 Run Plan. Round one in mode `project` exposed, in turn, a long-path SQLite open (t568, merged), a supervisor that explored instead of planning and could not write the raw plan (t569, merged: planning format, look budget), and builds that run out of calls at a third of their dollars (t570, in flight: per-brief call shares, Core-sized allowances, permitted acts from parts, interface lines in the brief, the subflow trial reusing the candidate trial's exclusion evidence). Merged since: t570-t575 (call shares, A21, A10b, judge evidence t574, acting briefs t575), downstream W8 (t573) and the Lab's call backstop at Core's 250 (t576), and t577 (a brief's turns capped at the builder loop's 64, which launch 5 hit). Launch 5's bigbox run, the first whose builders ran on this pair, showed no subflow trial could pass (downstream `reports/a8-bigbox-run-mv8186yr-debug.md`): t578 trial setup and reset, t579 dispatch waits for a passing predecessor, t580 builders explore from their entry, t581 honest builder endings, t582 supervisor plan checks are merged (ledger). Round one relaunches as launch 6. After A8: A7 re-author triage and A14 surveys; judge reliability on filtered list reads (seen in both modes).

**Not claimed:** that agents fix wrong judgements, or that a `project` build
has yet created a Flow live (none has reached its judged whole run).

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

### 2026-10-14 — A8 round-one fixes t568-t572
- Agent: workers t568-lab-chat-unavailable, t569-supervisor-plans-not-explores, t570-project-calls-and-brief-defaults, t571-a21-instruction-scope-write-error, t572-a10b-chat-sees-ask-ids; supervisor verified each and integrated
- Changed: t568 project SQLite opened through `path.toNamespacedPath` (long Windows paths); t569 the supervisor's own system text, a look budget of about 3 observe calls, and the planning format `subflows: [{ key, name, purpose, parts, inputs, outputs, after }]` Core compiles; t570 builders get a budget (the build's was stripped, so no wrap-up ever ran), a brief's call cap carved like its dollars with calls kept back for judging and finishing, Core-sized briefs (`project-agents/supervisor/brief-sizing.ts`), permitted acts from the parts, exact interface lines in the submit tool; t571 node-scoped instructions reach project SQL (migration `0026_relaxed_instruction_node_guard`, save checks scope owners, no swallowed write); t572 the chat model sees waiting asks with ids, the thread never does
- Why: A8 round one's four launches, each debugged (paired document, A8 Run Plan); A21 and A10b landed now so every A8 round runs on one frozen pair
- Validation: t570 in its worktree: `npx tsc --noEmit -p tsconfig.json` -> exit 0; vitest over project-agents, project-build, build-purse, subflow-candidate, loop-budget, flow-bootstrap/candidate -> 61 files, 456 passed; vitest over `runtime/llm` -> 197 files, 1950 passed; audit passed. t571: tsc exit 0; vitest over storage/project, service/summaries, service/flows -> 64 files, 477 passed, 4 skipped; audit passed (1 baseline entry lowered). t572: tsc exit 0; vitest over `runtime/conversations` -> 23 files, 215 passed; audit passed. Each Core finish ran `pnpm check` -> passed. Merges `39976038` (t568), `e56fec59` (t569), `d3462c48`, `d82816d2`, `e3debb51`; t568/t569 detail in their reports
- Outcome: Accepted. A8 round one relaunches after t574 (judge evidence in subflow trials, from the audit `a8-everything-store-judge-audit.md` in the paired document's reports)
- Follow-up: t571 found the SQL node table keys a node by id alone, so two Subflow graphs' `start` nodes overwrite each other, and the on_error errorCode mapping disagrees with the accepted-state validator (`reports/t571-a21-instruction-scope-write-error.md`); t572: an id the chat model writes still reaches the client in the response's `decision` (not the thread); t570: crossborder's task spec called Add to cart `modify_existing`, so a press classed `create_new` would go to the person's gate

### 2026-10-14 — Acting briefs may make any act the task asks for (t575)
- Agent: supervisor (found while reviewing t570's notes; implemented and verified)
- Changed: `project-agents/contracts/asked-acts.ts` (new): a brief whose parts act permits every lasting act the task spec asks for, one whose parts only read permits none; the brief contract's `brief_act_not_asked` check and the supervisor's brief input both use it
- Why: a builder could act only if its own reading of a press's class agreed with the supervisor's label in the task spec (t570: crossborder filed Add to cart as `modify_existing`); a mismatch reaches the person's gate, the Lab's person refuses an ask away from the task's point, and a refused act ends the builder; a single-loop build never asks
- Validation: `npx tsc --noEmit -p tsconfig.json` -> exit 0; vitest over `project-agents` and `service/project-build` -> 31 files, 202 passed (the new t575 case ran: 1 passed); `pnpm structure:check` -> passed (353 warnings, 1156 baselined); Core finish `pnpm check` -> passed; merged `8a0ac284`
- Outcome: Accepted

### 2026-10-14 — The judge sees a called part's read (t574)
- Agent: worker t574-a8-judge-evidence (with one follow-up round); supervisor verified and integrated
- Changed: a read under Call Subflow is matched to its own graph's node, in subflow trials and in whole runs whose root calls parts (`result-verification/called-nodes.ts`, the run's own Subflow source at the attempt's id and revision; otherwise counts only); conditions numbered and named `condition N (wording)` everywhere; Core settles left-out rows whose value it reads as a number failing a numeric-only bound (`value-readings/settled-rows.ts`), and a yes quotes that bound once; presence tests show kept and left-out values; quote pairing accepts empty pairs and adjacent sentences naming no rows; the judge's instruction (`llm/diagnosis-instructions.ts`) says so, with a guard test against scenario words; one in-place line in `service.ts` (`verifyRunResult` passes `calledGraphs`)
- Why: the downstream audit `a8-everything-store-judge-audit.md` found 3 of 5 subflow-trial verdicts wrong in run-mv7vor5f-ea4d08b4, two on exactly the oracle's rows, because the judge got no wording or tested values
- Validation: after merging dev into the branch: `npx tsc --noEmit -p tsconfig.json` -> exit 0; vitest over result-verification, candidate-trial, subflow-trial, llm, unfinished-build, refuted-result, project-agents, project-build -> 353 files, 3251 passed; `pnpm structure:check` -> passed (356 warnings, 1156 baselined); Core finish `pnpm check` -> passed; merged `3b5fa22a`. Worker's offline replay of run-mv7vmvhd-b0c18c5a step 0072 -> `"verdict":"answers"` (held before)
- Outcome: Accepted. Every change agreed before A8 round one's relaunch is merged
- Follow-up: re-ask a no whose named row Core's `checked` refutes (audit point 5, not built); a kept in-run repair that changes a part's graph leaves that part's reads at counts only

### 2026-10-14 — A8 launch-five fixes t577, t579-t582
- Agent: supervisor (t577); workers t579-a8-dispatch-waits, t580-a8-builder-entry, t581-a8-builder-endings, t582-a8-supervisor-checks, each with a follow-up round; supervisor verified and integrated
- Changed: t577 a brief's turns capped at the builder loop's 64 (sizing and contract); t579 a dependent brief starts only after its predecessor came back done with a proposal (this dispatch or the build record); t580 a dependent builder's entry is prepared by running its predecessors' passing proposals before its first look (`service/project-build/entry-preparation.ts`), and a press outside the brief is told to the model (only money, delete and send reach the person); t581 builders can complete `{ ended: blocked | partial, reason }`, refused submissions return their own script, a revision may not drop its only lasting act, a declared input no step reads is refused (`subflow.input_unread`), returns name the last trial's code and failing step; t582 write_plan warns on unused values and constraint subflows, an honest ending is held until a reset brief has come back (`project.completion_reset_first`)
- Why: A8 launch 5 (downstream A8 Run Plan): three builds' builders refused their own configuration; bigbox's builders ran but no subflow trial could pass (`!FluxIQWebExtension/.../reports/a8-bigbox-run-mv8186yr-debug.md`)
- Validation: t577: tsc exit 0; project-agents, project-build, subflow-candidate -> 38 files, 246 passed; the new end-to-end case fails without the fix. t579: tsc exit 0; project-agents + project-build -> 31 files, 213 passed. t580: tsc exit 0; project-agents, project-build, subflow-trial -> 35 files, 223 passed. t581 after merging dev (supervisor fixed one stub fixture whose parts declared an unread input): tsc exit 0; subflow-candidate, decision-handlers, project-agents, project-build, subflow-trial, flow-bootstrap/candidate, llm/tests -> 103 files, 973 passed. t582: tsc exit 0; project-agents + project-build -> 31 files, 212 passed. Every audit passed; every Core finish `pnpm check` -> passed. Merged `3a2cb555` (t577), `fc8e0d7b` (t579), `a52a128a` (t580), `64ecd204` (t581), `3921fd03` (t582)
- Outcome: Accepted. t578 (subflow trial setup and reset) is being wired; round one relaunches after it
- Follow-up: a saved control's fingerprint should not depend on text the build's own acts change (bigbox report fix 11); put `brief.permittedActs` into the scoped submission's scope so a first revision without its act is refused too (t581)

### 2026-10-14 — Subflow trials start on the start page and reset first (t578)
- Agent: worker t578-a8-subflow-trial-setup (two rounds; the second wired it in with wider ownership); supervisor verified, fixed two texts, integrated
- Changed: a subflow trial's first step loads the build's start location (`flow-bootstrap/verification/detached-subflow.ts`, with the navigation node's output action, without which every trial was refused); before every builder trial the site reset undoes every lasting act in the project ledger, across briefs (`service/project-build/trial-reset.ts`), never what existed before; builders get the undo tools when a reset is due; entry preparation shares the trial's start; the dispatch tool text and the undo hint corrected
- Why: the bigbox debug's cause A and the user's reset rule (2026-10-12)
- Validation: after merging dev: `npx tsc --noEmit -p tsconfig.json` -> exit 0; project-agents, site-reset, llm, flow-bootstrap/candidate, subflow-candidate -> 251 files, 2418 passed; subflow-trial, project-build, verification, candidate-trial, conversations/commands, api handlers -> 49 files, 429 passed, 2 skipped (pre-existing); audit passed; Core finish `pnpm check` -> passed; merged `fa403744`
- Outcome: Accepted. Every fix from A8 launch five is merged; round one relaunches
- Follow-up: entry preparation's start hook does not mark the acts it took back as undone in the ledger (self-corrects at the next trial); without a start hook, entry preparation runs predecessors on top of earlier briefs' acts; the arrival step shifts trial step numbers by one or two

### 2026-10-14 — A8 launch-six fixes t583-t588
- Agent: supervisor (t583); workers t584-read-builder-config, t585-builder-start-state, t586-whole-test-start-hook, t587-loop-guards-after-arrival, t588-returns-and-amend; read-only debugs of launch 6 (downstream reports); supervisor verified and integrated
- Changed: t583 a Flow's settings take calls up to Core's run backstop (both 64s now read `AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP`, moved to `llm/flow-execution-limits/run-call-backstop.ts`); t584 the builder's brief moved out of the submit tool description (it overran the 2,000-character limit), an invalid configuration names its check; t585 a prepared builder's opening counts as arrival (with the web domain), a reset's instruction lists its acts, entry preparation records what its start reset undid; t586 the whole test uses the start hook then the ledgers, a stalled supervisor gets a reset and an honest ending; t587 a start-location refusal lifts once the build arrives, a `code` key is no longer "executable", non-drafting loops get their own refusal-run warning; t588 returns name what stopped a builder and list trial receipts, `predecessor_not_done` says why
- Why: A8 launch 6: crossborder created a Flow that passed its judged run, then Core refused its settings; everything-store's builders refused their configuration; bigbox's dependent builder was never "arrived"; social could not reset a confirmed request
- Validation: t583: tsc exit 0; api handlers, llm, recovery/annotation -> 232 files, 2240 passed; audit passed (after moving the constant out of a 108-module cycle). t584 after merging dev: tsc exit 0; llm, subflow-candidate, project-build, project-agents, flow-bootstrap/candidate -> 258 files, 2406 passed. t585: tsc exit 0; project-build, project-agents, subflow-trial -> 38 files, 251 passed; domain node-run -> tests 356, pass 356. t586 after merging dev: tsc exit 0; project-agents, project-build, flow-bootstrap/candidate -> 54 files, 390 passed. t587: tsc exit 0; llm, flow-bootstrap/candidate, project-agents -> 242 files, 2325 passed. t588: tsc exit 0; project-agents + project-build -> 36 files, 238 passed. Every audit passed; every Core finish `pnpm check` -> passed. Merged `f146636f` (t583), `a3bc07b6` (t584), `5e6c5241` (t585), `64ab9bbc` (t586), `a0a6c929` (t587, t588)
- Outcome: Accepted. t590 (amend keeps unchanged proposals, the chat shows the recorded ending, guidance shapes) and t591 (a reset can name an act it cannot undo) are in flight; launch 7 follows them
- Follow-up: a hard refusal of new lasting acts during a reset would restrict actions beyond the user's permission rule (open question for the user, not built)

### 2026-10-14 — Amend keeps proposals, endings in Core's words (t590); resets name what they cannot undo (t591)
- Agent: workers t590-amend-and-chat-ending (three rounds; supervisor wired its last hook and resolved a merge conflict), t591-reset-can-name-irreversible; supervisor verified and integrated
- Changed: t590 an amend keeps the proposals of subflows it leaves unchanged for dispatch order, entry preparation, the dependent's subflow trial (`keptUnder`) and assembly, and its answer lists kept and dropped; a failed build keeps its own failure code (supervisor decision) and the person is told the ending's kind and Core's list of what is still on the target, never the model's reason (`build-ending.ts`'s rule kept, supervisor decision); ports, guidance and tools describe the current shapes; a repeated reset is answered with what it left. t591 a reset completes with `cannotUndo` (ended done, act kept), its run_node has no `write`, a lasting press without `undoes` is told as outside, reset and repeat wording for loops that draft nothing
- Why: the A8 launch-six bigbox and social debugs
- Validation: t591 after merging dev: tsc exit 0; project-agents, project-build, site-reset, llm, flow-bootstrap/candidate -> 261 files, 2449 passed; audit passed. t590 after merging dev: tsc exit 0; project-agents, project-build, subflow-trial, conversations, activity, flow-bootstrap/candidate, site-reset -> 129 files, 1073 passed; audit passed. Core finishes `pnpm check` -> passed. Merged `aa87d9b8` (t591), `998844ce` (t590)
- Outcome: Accepted. Every fix agreed after launch 6 is merged; A8 round one relaunches as launch 7
- Follow-up: `state.wholeTrialLeftActs` is never set now and can go once `supervisor/completion.ts:53` stops reading it; no test yet covers Core's note appended to a failure that has its own ending

### 2026-10-14 — A8 launch-seven fixes: one phase start (t593), a project build bound (t592), scope, judge, repairs (t594, t595)
- Agent: workers t592-project-build-deadline, t593-phase-start, t594-builder-scope-and-judge, t595-supervisor-repairs (two rounds); read-only debugs of launch 7 (downstream reports); supervisor verified and integrated
- Changed: t593 every phase (builder, repair and reset exploration, entry preparation, subflow trial, whole trial) starts from `service/project-build/phase-start.ts`: start hook, build-wide reset, arrival, predecessors, a `phaseStart` record; per-phase copies removed; the assembled Flow opens with the arrival; undeclared effectful presses recorded as possibly lasting. t592 `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS` (30 min) enforced on the supervisor with a 5-minute ending slice. t594 the subflow judge sees the other parts as out of scope; an output bound to a success/failure port refused; a dependent builder may end blocked at a done entry; the repeat note names the blocked ending. t595 a repair builder sees its failing trial; `project.brief_repeated` and `project.repair_unchanged`; plan refusals say why; an amend drops a proposal whose goal facts changed (supervisor decision); chat words for build_partial and build_blocked
- Why: launch 7 lost three builds to the Lab's chat deadline, ran a whole test on a stale page (the start-state failure a fifth time), let a builder do another part's act unjudged, and looped eight repairs on nothing
- Validation: t592: tsc exit 0; loop-limits, project-agents, project-build -> 42 files, 287 passed. t594 after merging dev: tsc exit 0; project-agents, project-build, subflow-candidate, candidate, llm, result-verification -> 332 files, 3082 passed. t595 after merging dev: tsc exit 0; project-agents, conversations, project-build, subflow-candidate -> 72 files, 552 passed. t593 after merging dev: tsc exit 0; project-build, project-agents, subflow-trial, verification, site-reset, candidate-trial, subflow-candidate, candidate, conversations, llm -> 326 files, 3053 passed, 2 skipped (pre-existing). Every audit passed; every Core finish `pnpm check` -> passed. Merged `96c85b21` (t592), `3ed71835` (t594), `fbae9827` (t595), `4e21f307` (t593)
- Outcome: Accepted. t597 (switch on t594's lasting-act check; endings name possibly lasting presses) is in flight; launch 8 follows it
- Follow-up: the build record cannot hold possibly lasting acts (its parser refuses an act with no class); router rules that read page state choose before the arrival runs; `site-reset/ledger.ts` at 441 lines (advisory)

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
