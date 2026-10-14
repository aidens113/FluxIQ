# Delivered worker briefs, 2026-10-13

Moved from `../../automation-project-agents-plan.md` at the first compaction. Every unit below was supervisor-verified and merged; the outcomes are in that document's Work Ledger.

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

### Brief: t536-a3b-lease-core
- Repository: FluxIQ Core, worktree `fxwork/t536/!FluxIQ`, branch `task/t536-host-lease-wire`. Paired with W1 (downstream, same task); they merge together.
- Task: unit A3b, carry the host lease on every host command. The wire type `lease?` on the execute-action
  command and the refusal codes are already in `packages/contracts/src/client-gateway.ts` (supervisor-written
  on this branch; change their shape only with a reason in your report). (1) New
  `project-agents/host-resources/lease-scope.ts`: a `scheduler.run` variant that puts the lease in an
  AsyncLocalStorage scope for the work. (2) Core's gateway stamps `lease` from that scope on every command,
  the way `commandOwner` is stamped (`client-gateway/service/commands.ts:91,209-211`, `service/types.ts:41`,
  wired at `programs/_shared/runtime.ts:79-87`); a caller-supplied lease that differs from the scope is
  refused; strict mode: while the port's resource is held, a command without the current lease is refused.
  A stale lease is refused before sending, with the same failure record the extension uses (`failed`,
  category `blocked_by_capability_or_policy`, code `host_lease.stale`, retryable false, stage `dispatch`,
  effect `unacted`). (3) Durable path `service/command-ledger/dispatch.ts`: admit `lease` (allowlist
  `:186-188`), stamp it before the request digest (`:47`), throw before the claim on a stale lease. (4) Optional
  `hostResources` port on `AutomationStudioHostRuntimeBoundary` (`runtime/host-runtime.ts:86`).
- Required reads: this document's `Host resources and concurrency`; `project-agents/host-resources/`;
  the files named above; `docs/architecture/code-structure.md`.
- Owns: the files named above, a new `client-gateway/service/host-lease/`, their tests, tests for the contracts
  type; `docs/working/automation-project-agents-plan/reports/t536-a3b-lease-core.md`.
- Must not touch: `service.ts`; other `host-resources/` files; `llm/`; `project-agents/{contracts,record}`;
  `flow-bootstrap/`; `harness-options/binding.ts`; `io-policy.ts`; any downstream file.
- Definition of done: tests: stamped from scope; no scope gives today's payload byte for byte; stale and
  forged leases refused unsent with a record that parses as failed and unacted; strict mode; durable digest
  includes the lease, a malformed lease is `invalid_command`, a stale one throws before the claim; two
  concurrent scopes on a capacity-2 stub stamp their own leases; a trial run (`runCanonicalAutomationStudioFlow`
  with stub adapter and host runtime) inside a scope stamps every command. Four narrow checks pass, plus
  `pnpm.cmd --filter @fluxiq/contracts build` and the contracts tests.
- Report to: `docs/working/automation-project-agents-plan/reports/t536-a3b-lease-core.md`

### Brief: t537-a4a-builder-scope
- Repository: FluxIQ Core, worktree `fxwork/t537/!FluxIQ`, branch `task/t537-subflow-builder-scope`
- Task: unit A4a, the builder side of a subflow builder. Contracts are fixed in
  `flow-bootstrap/subflow-candidate/contracts.ts` (supervisor-owned; propose changes in your report).
  In `flow-bootstrap/subflow-candidate/`: `scoped-submission.ts` (a per-brief controller reusing the pieces of
  `AutomationStudioFlowCandidateSubmissionController`: refuse any Router rule or `when:` line, any subflow but
  the scope's and its own `part`s, a part key colliding with a sibling, and any change to the scope's
  `interface` or `successCheck`; then run the existing completion check on a probe plan of the target plus its
  parts with the router fallback at the target, passing the scope's part quotes as the instruction text);
  `subflow-digest.ts` (binds buildId, briefId, planDigest, subflowKey and today's fingerprint inputs);
  `subflow-trial-gate.ts` (asks an `AutomationStudioSubflowTrialPort`, keeps partial verdicts, separate from
  the whole-candidate gate); `role-tools.ts` (the builder drops `core.run_flow`, `core.submit_candidate`,
  `core.test_candidate`, `project.*`); `builder-loop.ts` (the candidate loop's discovery mode with these tools,
  completion `{subflowKey, revision, digest}`). Call ids: `callScope?` on the loop input
  (`llm/loop-configuration.ts:40`) and a helper in `llm/evidence-loop/call-id.ts`: without a scope the opening
  id is byte-identical (`initial.<toolId>`), with one it is `initial.<toolId>.<scope>`; use it at
  `llm/evidence-loop.ts:533,539` and its predicate at `flow-bootstrap/candidate/authoring-loop.ts:14,149`.
- Required reads: this document's `Contracts`; `flow-bootstrap/candidate/{authoring-loop,submission,digest,trial-gate}.ts`;
  `llm/harness-options/bootstrap-completion.ts`; `docs/architecture/code-structure.md`.
- Owns: new files in `flow-bootstrap/subflow-candidate/` with `tests/` and its `index.ts`; the lines named in
  `llm/evidence-loop.ts`, `llm/loop-configuration.ts` and `authoring-loop.ts`; `llm/evidence-loop/call-id.ts`
  and its test; `docs/working/automation-project-agents-plan/reports/t537-a4a-builder-scope.md`.
- Must not touch: `service.ts`, `subflow-candidate/contracts.ts`, every other `flow-bootstrap/candidate/` file
  (t532 edits them), `verification/`, `site-reset/`, `service/`, `project-agents/`, `llm/build-purse/`.
- Definition of done: tests: each refusal above; the digest changes with each scope field; two controllers never
  match receipts; a subflow-gate yes fed to the whole gate's `completion` still answers `candidate.trial_required`;
  builder tools exclude whole-candidate and `project.*`; opening id unchanged without a scope, suffixed with one,
  still recognised by the authoring loop; existing evidence-loop and authoring-loop tests pass. Four narrow checks.
- Report to: `docs/working/automation-project-agents-plan/reports/t537-a4a-builder-scope.md`

### Brief: t538-a4b-partial-trial
- Repository: FluxIQ Core, worktree `fxwork/t538/!FluxIQ`, branch `task/t538-subflow-partial-trial`
- Task: unit A4b, the validator side of a subflow builder, implementing `AutomationStudioSubflowTrialPort`
  from `flow-bootstrap/subflow-candidate/contracts.ts` (import only). (1) New
  `flow-bootstrap/verification/detached-subflow.ts`: an explicitly partial entry, leaving
  `detached-execution.ts` and its partial refusal untouched; reuse its identity and freshness checks, plan
  validation and normalization, the t529 `automationStudioCandidateGraphSource` (no accepted-graph fallback),
  root invocation and per-graph failed-route budget; run the predecessors' proposals then the target with its
  interface inputs read from their outputs (a throwaway root graph of Call Subflow steps reuses the C1 boundary
  and per-frame success check; your choice, say which). A failed predecessor means the target does not run and
  `entryPrepared` is false. (2) New `service/subflow-trial/` (`run.ts`, `port.ts`, barrel): opens the session
  with `metadata.subflowTrial = {buildId, briefId, subflowKey, revision, digest}` (never `adaptiveRuntime`),
  takes injected `predecessorProposals(scope)` and an injected scoped judge, and reuses `candidate-trial`
  helpers (feedback, summary, landed acts, frame evidence) by import. (3) Project ledger: optional constructor
  options on `flow-bootstrap/site-reset/ledger.ts` (`owner`, `nextActId`, `sink`; default unchanged) and new
  `site-reset/project-ledger.ts` whose `forBrief(briefId)` returns a real ledger: globally unique act ids, acts
  attributed by brief, a brief claims and sees only its own acts (including `stillThere`'s others check), one
  serialized writer, a snapshot for the build record. (4) New `service/runtime-session/build-trial-admission.ts`:
  admits a subflow-trial session only for a known build and a current lease (`assertCurrent` from
  `project-agents/host-resources/`).
- Required reads: this document's `Contracts`; `flow-bootstrap/verification/{detached-execution,candidate-graphs}.ts`;
  `service/candidate-trial/{run,port,contracts}.ts`; `flow-bootstrap/site-reset/ledger.ts`; `docs/architecture/code-structure.md`.
- Owns: the new files above with barrels and `tests/`; `ledger.ts` constructor only; the export lines in
  `verification/index.ts`, `site-reset/index.ts` and `runtime-session/index.ts`;
  `docs/working/automation-project-agents-plan/reports/t538-a4b-partial-trial.md`.
- Must not touch: `detached-execution.ts`, `candidate-graphs.ts`, `service/candidate-trial/*`, `admission.ts`,
  `service.ts`, `flow-bootstrap/candidate/`, `flow-bootstrap/subflow-candidate/`, `llm/`, `project-agents/`.
- Definition of done: tests: predecessors then target from the candidate source; a subflow outside the topology
  fails and accepted graphs are never read (spy); a failed predecessor stops the target; identity or staleness
  refuses; `detached-execution` still refuses partial options; session metadata and the injected judge; a
  `partial: true` result with predecessor acts; the project-ledger cases above with the old ledger tests
  unchanged; admission refuses a stale or missing lease and admits two at once on a capacity-2 stub. Four
  narrow checks pass.
- Report to: `docs/working/automation-project-agents-plan/reports/t538-a4b-partial-trial.md`

### Brief: t539-a6-attribution-core
- Repository: FluxIQ Core, worktree `fxwork/t539/!FluxIQ`, branch `task/t539-agent-attribution-chat`. Paired with W2 (downstream, same task); they merge together.
- Task: unit A6. Every build activity event carries which agent it comes from, and the supervisor's plan,
  briefs, returns and receipts reach the chat as cards. The wire types are fixed on the branch
  (supervisor-written in `packages/contracts/src/client-gateway.ts`): `agent?: ClientGatewayActivityAgent` on
  `ClientGatewayActivity` and `project?: ClientGatewayActivityProjectCard` on a `note` row's detail; re-export
  them from `packages/client-gateway-websocket/src/index.ts`. (1) New `activity/agent.ts`: its own
  AsyncLocalStorage (`runWithAutomationStudioActivityAgent(agent, fn)`, `currentAutomationStudioActivityAgent()`),
  separate from the scope frame (`bind.ts:12-13` mutates the frame in place). Stamp it in the one publish path,
  `activity/emit.ts:21`, so no emit site changes; bound it in `activity/bounded.ts` (closed role set, `briefId`
  id-shaped like `TARGET_ID`, `subflowName` 160, `project` kept only on `note` rows, parts and subflows at most
  20, strings 160, `reason` 240; `boundedDetail` copies unknown fields unbounded today, so bound these
  explicitly). (2) New `activity/project/`: emitters for the four cards built from the A1 contracts
  (`project-agents/contracts/`); never a digest in any title or ref (the extension hides such rows).
  (3) Step log: `role` and `briefId` in the step-log scope (`llm/step-log/scope.ts`), the three meta writers and
  two new `index.md` columns (`listing.ts`). (4) New `project-agents/attribution/`
  (`withAutomationStudioProjectAgent(agent, fn)`) setting both stores, since `llm/` imports nothing from
  `activity/`. (5) Core's web panel keeps working: it drops unknown top-level fields and ignores `note` rows,
  which is why the cards ride on `note`.
- Required reads: this document's `Contracts`; `activity/{emit,bounded,contracts,storage,bind}.ts`;
  `llm/step-log/{scope,listing,model-step,tool-step,answer-step}.ts`; `apps/web/src/features/automation-studio/conversation/activity/contracts.ts:91-167`.
- Owns: the files named above, `activity/index.ts`, new dirs with barrels and `tests/`;
  `docs/architecture/automation-studio/client-gateway.md` (activity section);
  `docs/working/automation-project-agents-plan/reports/t539-a6-attribution-core.md`.
- Must not touch: `service.ts`; `project-agents/{contracts,record,host-resources}`; `flow-bootstrap/`;
  `llm/evidence-loop.ts` and every other `llm/` file but `step-log/`; `client-gateway/service/`; any downstream file.
- Definition of done: tests: events inside an agent frame are stamped and outside are not; innermost wins; two
  frames under `Promise.all` stay apart; a run still binds inside an agent frame; bounds drop unknown roles,
  malformed brief ids and `project` off `note`; the publisher carries `agent` unchanged; each card from A1
  fixtures with no digest in titles or refs; step-log meta and index columns; Core web panel stream test still
  parses stamped events and project notes. Four narrow checks plus the contracts build and tests.
- Report to: `docs/working/automation-project-agents-plan/reports/t539-a6-attribution-core.md`

## Second compaction

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
  [the sweep record](../sweep-2026-10-13.md) (Group A, B or C). Almost every
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

### Brief: recording-delete-windows-retry
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: the confirming sweep (2026-10-13, Core `a2cc2a52`: 1 failed of 11207) failed
  `runtime/tests/service-recordings/tests/assets.test.ts` > "deletes recording batches with one index and pipeline
  cleanup pass" with `EPERM: operation not permitted, rmdir '...\recordings\recording.batch-b\derived'`; the file
  passes 3 of 3 alone. The product's own delete removes the directory while another handle briefly holds it, which
  Windows reports as EPERM/EBUSY; the delete has no bounded retry. Find the code that removes a recording batch's
  directories, and make it (and any sibling removal of the same kind) use one bounded-retry removal: reuse an
  existing Core helper if there is one (search for `maxRetries`, `rm(`, `rmdir`), otherwise add one focused helper in
  the owning storage area. Never swallow a lasting failure: after the retries a removal that still fails throws as
  before. Add a test that injects one transient EPERM and one lasting EPERM.
- Required reads: the failing test, the delete path it exercises, `docs/architecture/code-structure.md`.
- Owns: the removal code you find and its tests, a new helper if needed; `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: `runtime/service.ts` (another unit owns it now; if the removal lives there, report instead of editing),
  `project-agents/`, `flow-bootstrap/`, `llm/`.
- Definition of done: the new tests; `assets.test.ts` and the tests beside the changed files pass; check; audit; diff check.

### Brief: project-build-hardening
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: close the gaps A5c reported (`reports/t549-a5c-wiring.md`) before any paid run of mode `project`.
  (1) A builder's permission ending (the person declined, or its ask ended the brief) must end that builder's
  loop, not only its tool calls: combine the per-brief gate's ending into the loop's signal in the dispatcher
  (`project-agents/dispatch/run-brief.ts`), and come back `blocked` with the reason. (2) The permission outcome at
  promotion must include every builder gate's answers, not only the build-level gate's
  (`service/project-build/promote.ts` and where the gates are made): a declined act anywhere in the build is seen
  at promotion exactly as the candidate path sees its own. (3) The supervisor's reserve covers the judged whole run
  and one repair round (plan: Invariants), sized from the judge's existing reserve pricing; allowances can never
  be carved from it. (4) A service-level test with a stub provider and stub host where builders leave lasting acts:
  the supervisor's whole trial is refused until a reset brief runs, the reset brief undoes exactly the build's acts
  (never a pre-existing one) and returns done, then the whole trial runs. (5) `runtime/service.ts` `deleteRecording`
  (~941, ~944) removes its session directory through `removePathWithRetry` (`service/recordings/directory-removal.ts`):
  in place, net zero lines, no packing. (6) Write the project ledger's acts into the build record as they are recorded
  (`record.lastingActs`), so the record is complete after a restart.
- Required reads: the A5c report; this document's Invariants and Contracts; the files named above.
- Owns: `project-agents/dispatch/run-brief.ts` and its tests; `service/project-build/**`; the two lines in
  `runtime/service.ts`; the record store's lasting-act write if needed (`project-agents/record/store.ts`) and its
  tests; `docs/working/automation-project-agents-plan/reports/<your label>.md`.
- Must not touch: `flow-bootstrap/**`, `llm/**`, `activity/**`, `project-agents/{supervisor,contracts,host-resources}/**`
  (report a contract change instead of making it).
- Definition of done: tests for (1)-(4) and (6); the tests beside each changed file; `project-agents` and
  `service/project-build` suites; check; audit (service.ts lines unchanged); diff check.

