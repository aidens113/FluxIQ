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

