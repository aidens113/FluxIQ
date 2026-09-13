# MVP Week 1 — Web Automation Reliability Plan (Core share)

Status: Active
Status detail: The downstream Week 1 finish made thirteen Core code commits, released as `fluxiq` 0.4.0 with migration notes; the sequential suite, build and package lint passed on `20bb3b4`, and both `dev` branches are pushed together after the downstream root gates.
Created: 2026-09-11
Last updated: 2026-09-13
Owner: Senior supervisor agent
Scope: Core's share of the downstream web extension's MVP Week 1 plan: the failure-category enum, record, parser, and carriers on the gateway, runtime, dispatch, node, attempt, and LLM-context types; structured-first failure classification; the target-resolution outcome on the attempt trace; loading a domain's panel host through Core's public exports; the structure-audit baseline ratchet; the expectation-evaluator seam (C3, Wave 3); and the two 2026-09-12 element-matcher changes — publishing the matcher for a browser bundle, and charging a missing stable identifier less than a contradicted one.
Paired document: `F:\!FluxIQWebExtension\docs\working\mvp-week1-web-automation-reliability-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), downstream audits `audit-core-runtime.md` section (c) and `audit-failures.md` under `F:\!FluxIQWebExtension\docs\working\mvp-week1-web-automation-reliability-plan\reports\`

---

## Current State

**Phase: the downstream Week 1 finish, released as `fluxiq` 0.4.0 on
2026-09-13.** On 2026-09-11 the user directed that changes belonging in Core are
made in Core, never approximated downstream. The downstream session finishing
Week 1 made thirteen Core code commits under that rule. The user was alerted before
each area's first edit, and every commit is recorded in the Work Ledger.

**True on 2026-09-13.**
- **Branch:** `dev`, 16 commits ahead of `origin/dev` with this plan's commit, not
  pushed. The last code commit is `20bb3b4`; three of the sixteen are plan-only.
- **Versions:** `fluxiq` is **0.4.0**. `@fluxiq/contracts` (0.2.0) and
  `@fluxiq/client-gateway-websocket` (0.1.0) are unchanged.
- **The thirteen code commits:**
  - `5d495eb`, a value resolved out of state is withheld from the persisted
    trace;
  - `267a2ca`, a recording message arriving after Stop finalized its recording
    is discarded and audited, not a failed connection;
  - `6f172b9`, a rejected expected state fails its action attempt;
  - `0e6d3ac`, an honest element-target trace, the recorded element's identity,
    and no late domain events;
  - `c0e0ce9`, a recording mapper candidate's `expectedState` and the mapper
    context `following`;
  - `5ca9981`, one expectation-rejected record, and an empty expectation counts
    as none;
  - `73a81e9`, a client's recording start ordered with what follows it, and
    acknowledged;
  - `187f40d`, a recorded entry keeps its source event's id and source;
  - `5845f5d`, the `0.4.0` release, with a Migration Notes entry covering every
    change above;
  - `949fbb4`, a client's recording messages are stored in the order the gateway
    received them, and a Stop never touches a recording opened during it;
  - `6621d66`, run inputs and resolved values withheld at rest, without changing
    what a run executes;
  - `b54df69`, a command's target is given its timeout, and Core waits 3,000 ms
    longer for the answer;
  - `20bb3b4`, a Flow with no Start node begins at its graph's root, and a
    compiled plan follows the same rule, as compiler version `compiled-plan.v2`.
- **Migration Notes:** the last four code commits are in the unreleased `0.4.0`
  entry.

**Gates.**
- **Per commit:** the downstream supervisor reran each commit's own tests,
  `pnpm check` and `pnpm docs:check` (ledger).
- **On `20bb3b4`:**
  - the full suite ran with `--no-file-parallelism`: `fluxiq` 137 files and 955
    tests, and `@fluxiq/web` 228 files and 1,156 tests, with contracts and
    gateway-websocket too;
  - `pnpm check`, `pnpm docs:reference` and `pnpm docs:check` also ran.
- **Build and package lint on `20bb3b4`:** `pnpm build` exit=0 on its first run,
  and `pnpm package:lint` exit=0.
- **Push:** both `dev` branches are pushed together, after the downstream Lab
  rerun and root gates.

**The matcher constant is still coupled downstream.** Flipping
`MISSING_STABLE_IDENTIFIER_SIMILARITY` (−0.1) back to −0.55 turns the downstream
`reworded-aria` case in
`apps/extension/e2e/content/tests/identity-resolution.spec.ts` red. The constant
and that spec are one unit, so the two `dev` branches are pushed together. The
figures and the rungs crossed are in `package-boundaries.md`'s `0.3.0` Migration
Notes entry.

**Core's parallel test suite is unsound on this machine, and it predates this
work.** `pnpm test` in parallel loses one or two test files per run to `Error:
Worker exited unexpectedly`, and once died with a segmentation fault; the file
lost differs between runs. The cause surfaces as `SQLITE_CORRUPT: malformed
database schema (fk_subflows_parent_flog_id_insert)` in
`global-automation-studio-workspaces.test.ts` — Core's suite uses a native
SQLite module, so the corruption usually kills the worker outright instead of
failing a test. Verify Core with `--no-file-parallelism` here, and treat a
parallel worker crash as an environment result rather than a regression. Note
for anyone bisecting this: a single clean parallel baseline run does not clear a
change, because the flake is intermittent — the sequential run is the sound
comparison.

**Open for Core.**
- A client's `clientType` and `capabilities` come straight from its `hello`
  frame, so nothing that gates on them is an authentication (Open Questions).
- These are recorded for the downstream Phase 1.6b ranking, not Week 1:
  - nothing in Core honours a node's `failureRoute`;
  - approving a recording proposal into a node definition drops `expectedState`;
  - the discard audit calls a runtime confirmation that reached no open
    recording a lost recorded action;
  - an `AutomationStudioService` built without `dataDir` writes `recordings/`
    and `indexes/` into the working directory;
  - a recording approved beside a Subflow's existing nodes gives the graph a
    second root, so its run now refuses instead of starting at the smallest id;
  - among several edges on one route, the smallest edge id wins.

**Next steps:** push `dev` together with the downstream `dev`, once the downstream
Lab rerun and root gates pass.

**Blockers:** none.

---

## Decisions

- **A behaviour change on a published surface takes a minor version and a
  migration note.** The matcher weights shipped under the `0.2.1` an unrelated
  additive export had already published, so `fluxiq` is now **0.3.0** with a
  `0.3.0` entry under Migration Notes. Not a patch, for three reasons: Core's
  policy attaches migration notes to the minor rung, so a change that needs one
  has no home at the patch rung; the 0.2.0 note already carries an
  un-opt-out-able behaviour change under a minor increment, which is the same
  case; and this change moves a number the runtime's own element-target gates
  read, so under a caret range a `destructive` gate would move with no host code
  changing. Rejected alternative: declaring scoring weights outside the
  compatibility promise. `confidence` is a published output and the ladder's
  thresholds are Core's own, so excluding the weights would leave the ladder
  meaningless as a contract. `package-boundaries.md` now states that
  "compatible" is judged on what a consumer observes, not on the type surface.
- **Core owns failure names, the record, its parser, and every carrier; the
  domain produces values.** One enum only — `AutomationStudioAdaptiveFailureClass`
  extended, never a second taxonomy in Core or downstream (downstream D3).
- **Every addition is optional, with one deliberate exception.** A host that
  sets none of the new fields still gets Core's own failure records for
  timed-out, rejected, and unconfirmed dispatches and for element-target misses,
  and a failed dispatch's error becomes the attempt message, so the legacy regex
  classifier (kept only for records without the structured field) now sees it.
  That is the purpose of C1; the migration note records it.
- **Category mapping.** Downstream plan names map to Core members by the table in
  `reports/core-failure-taxonomy.md`. `STATE_MISMATCH` → `expected_state_missing`
  and `ACTION_REJECTED` → `blocked_by_capability_or_policy` are accepted; a
  producer may still use `unexpected_state` when an unexpected element is the cause.
- **The failure-record parser drops a record that breaks its rules, whole.** Six
  categories are never retryable, and target categories name only the
  `target_resolution` stage; every producer's tests therefore parse what it emits.
- **`@fluxiq/client-gateway-websocket` stays at 0.1.0.** It only re-exports the
  gateway result, whose new `failure` field is optional; `@fluxiq/contracts` and
  `fluxiq` move to 0.2.0.
- **Value imports inside `packages/contracts/src` use `.ts` specifiers.** The web
  app compiles contracts source through Turbopack, which does not map `.js` back
  to `.ts`; the build rewrites them to `.js` in `dist`.
- **The browser gets the matcher through a new exports subpath, not a
  restructure.** `fingerprinting/` already had its own barrel and compiles to
  JavaScript with no imports; only its publication was missing. Adding
  `./automation-studio/fingerprinting` to `packages/fluxiq/package.json` was
  therefore the whole fix, and the guarantee is held by
  `fingerprinting/tests/index.test.ts` rather than by a comment (`fafe7c7`).
- **An absent stable identifier is weaker evidence than a contradicting one, and
  the scale now says so** (downstream D13, `a575df2`). −0.1 against −0.8, as two
  named constants. Core accepted the measured cost on its published seam: a
  candidate with exact text and no `id` crosses the `safe` and default confidence
  rungs. The alternatives — lowering the downstream floor, or normalizing over
  answerable weight — were rejected by measurement downstream, not by preference.
- **`MISSING_STABLE_IDENTIFIER_SIMILARITY` is a cross-repository constant.** A
  downstream e2e case is calibrated against its value, so Core changes it only
  together with that spec, and the two repositories' `dev` branches ship the
  change in the same work unit.

## Worker Briefs

Report paths are under `docs/working/mvp-week1-web-automation-reliability-plan/reports/`.
Workers follow Core's `AGENTS.md` (Repository Boundary, Code Structure,
Validation) and write file content with the Write or Edit tool, never a Bash
heredoc (the Bash tool corrupts `\\`, and commands over about 8 KB fail).

The completed Week 1 Core briefs are archived verbatim at
[archive/2026-09-13-core-worker-briefs.md](./mvp-week1-web-automation-reliability-plan/archive/2026-09-13-core-worker-briefs.md).

## Work Ledger

Settled entries from 2026-09-11 and 2026-09-12 are archived verbatim at
[archive/2026-09-13-core-ledger.md](./mvp-week1-web-automation-reliability-plan/archive/2026-09-13-core-ledger.md).

### 2026-09-13 — A late recording message is discarded, not a failed connection

- Agent: downstream worker `g-core-late-event`, briefed by the downstream
  supervisor (its brief and report live in the downstream plan's `briefs/` and
  `reports/`); verified by that supervisor.
- Changed: `programs/automation-studio/client-gateway/bridge.ts` (a private
  `appendOrDiscard` around every append a client message causes: the direct
  recorded input, the queued entry flush, and the `client.error` marker),
  `client-gateway/tests/bridge.test.ts` (four rows),
  `docs/architecture/automation-studio/client-gateway.md`, and the two generated
  `framework-reference.md` copies.
- Why: Stop finalizes a recording before the bridge forgets it, so a message
  arriving in that gap still finds it active and the service throws
  "Finalized recordings are immutable." (`runtime/service.ts:1017`). On the
  direct path the throw escaped `gateway.receive`, the WebSocket host answered
  `server.error` `gateway.receive_failed`, and the extension marked a healthy
  connection failed; on the 25 ms timer flush it was an unhandled rejection that
  lost the entry silently. Now a refused append re-reads the recording, and when
  `endedAt` is set the messages are audited as discarded against that recording;
  any other failure still propagates. The service refuses with an uncoded
  `Error`, so the match is the condition the service tests, never its message
  text. No error frame is sent to the client: that is a Week 2 contract.
- Validation: supervisor `npx vitest run
  .../client-gateway/tests/bridge.test.ts --no-file-parallelism` -> `Tests 15
  passed (15)`; `pnpm check` -> exit 0, `structure-audit: passed (120
  warning(s), 256 baselined)`; `pnpm docs:reference` -> one line changed in each
  copy (`AutomationStudioClientGatewayBridge` moved from `bridge.ts:84` to
  `:91`); `pnpm docs:check` -> exit 0, `Deterministic framework reference is
  current.` Worker: before the fix `3 failed | 13 passed` with one unhandled
  rejection; four mutations each failed their rows, restored byte-identical.
- Found: `appendRecordingDomainEvent` never checks `endedAt`, so a late event
  with no registered input is written into a finalized recording (a probe, not
  fixed here); briefed downstream as part of `g-core-target-gate`.
- Not verified: `pnpm build` and `pnpm test` (the Lab will run against a pinned
  worktree of this commit); the extension's behaviour after the fix, live.
- Outcome: Accepted

### 2026-09-13 — A rejected expected state fails its action attempt

- Agent: downstream worker `w19-c1`, briefed by the downstream supervisor
  (`briefs/finish-week1.md`, `reports/w19-c1.md` in the downstream plan);
  verified by that supervisor.
- Changed: `programs/automation-studio/runtime/executor/transition-comparison.ts`
  and `executor/tests/node-execution.test.ts`.
- Why: a probe of this executor gave a click whose expected state the host
  rejected as `auth_required` -> `"runStatus": "succeeded"`, the attempt
  `"failure": null`, the comparison only `"blocked"`, and the next node
  dispatched, so an expectation could never fail a run. Now a rejection returns
  the attempt as `status: "failed"`, `route: "failed"`, with a `message` and
  `failure` set to the host's record when it parses and Core's
  `expected_state_missing` record otherwise, keeping `transitionComparison`.
  Non-succeeded attempts and `builtin.policy.expectation` are untouched.
- Compatibility: this is a behaviour change for every host that binds
  `expectationEvaluator` on a node carrying `expectedState`; the downstream web
  domain declares the parameter but nothing writes it yet. It ships in the same
  minor release as the target-gate change.
- Found: nothing in Core honours a node's `failureRoute`, even for a failed
  dispatch (a probe routed a `failureRoute: "success"` failure as `failed`), so a
  rejection routes exactly as a failed dispatch does; that gap is a Week 2 item.
  The `expected_state_missing` record is copied from an unexported constant in
  `nodes/policy/expectation.ts`; the downstream `w19-c2` brief exports it once
  and deletes the copy.
- Validation: supervisor, `npx vitest run .../executor/tests/node-execution.test.ts
  .../transition-comparison.test.ts .../trace-withholding.test.ts
  --no-file-parallelism` -> `Test Files 3 passed (3)`, `Tests 28 passed (28)`.
  Worker: removing the transform -> `4 failed | 7 passed`; removing the record
  parse -> `1 failed | 10 passed`; both restored byte-identical; `pnpm check` ->
  exit 0; `pnpm docs:check` -> exit 0.
- Not verified: `pnpm build`, root `pnpm test`, and the Lab.
- Outcome: Accepted

### 2026-09-13 — An honest element-target trace, the recorded element's identity, and no late domain events

- Agent: downstream worker `g-core-target-gate` (`reports/g-core-target-gate.md`
  in the downstream plan); verified by the downstream supervisor.
- Changed: `nodes/contracts.ts` (the target resolution is a union keyed on
  `status`); `runtime/io-policy.ts` (with no candidates the resolution is
  `{ status: "unresolved_no_candidates", candidateCount: 0 }`, with no
  `minimumConfidence` claimed as applied); `model/action-element-target.ts` and
  the mapper-target region of `runtime/service.ts` (a recorded action's target
  takes its identity from `parameters.element`, maps `implicitRole` to `role`,
  and never copies the typed `parameters.text` into `visibleText`; the action's
  own `selector` and `statePath` still win); `appendRecordingDomainEvent` in
  `runtime/service.ts` refuses a finalized recording, and `client-gateway/bridge.ts`
  audits such an event as `recording.event_discarded`; their tests;
  `docs/architecture/automation-studio.md`, `automation-studio-native-nodes.md`,
  `package-boundaries.md`; both generated framework references;
  `.structure-baseline.json` (`service.test.ts` lowered from 4789 to 4787).
- Why: the downstream `i-resolver-safety` investigation found the element-target
  gate is inert for web and was misreporting itself: its trace presented a
  confidence floor no candidate was ever measured against, and the mapper built a
  type node's target with the typed text as its visible text. A probe also showed
  a late domain event with no registered input written into an already-finalized
  recording.
- Decisions: the `bridge.ts` and `bridge.test.ts` edits, outside the brief, are
  accepted: without the bridge wrap the refusal would reject `gateway.receive`
  and reopen the connection-failing defect `267a2ca` closed. Wiring candidates
  into the gate (B.3) is Week 2. The `minimumConfidence` type change can break a
  host that reads it unconditionally, so this and the expectation verdict change
  go out as a minor release, with the migration note taken out of "Unreleased".
- Validation: supervisor, `npx vitest run .../runtime/tests/io-policy.test.ts
  .../model/tests/action-element-target.test.ts
  .../client-gateway/tests/bridge.test.ts .../runtime/tests/service.test.ts
  --no-file-parallelism` -> `Test Files 4 passed (4)`, `Tests 142 passed (142)`;
  `pnpm check` -> exit 0, `structure-audit: passed (120 warning(s), 256
  baselined)`, `1 baseline entries can be lowered`; `pnpm docs:check` -> exit 0.
  Worker: every new row failed before its fix; six mutations each failed only
  their row, restored byte-identical. Its full sweep failed four executor rows
  only because `w19-c1` was editing those files at the same time, a
  coordination slip by the supervisor; `6f172b9` is that work, verified
  separately.
- Not verified: a generated Flow's click node carrying the recorded identity and
  its type node carrying no typed text, in the Lab; a live late domain event;
  `pnpm build` and root `pnpm test`.
- Outcome: Accepted

### 2026-09-13 — A recording mapper can claim the state its action should leave, and sees what followed

- Agent: downstream worker `w19-c2` (`reports/w19-c2.md` in the downstream plan);
  verified by the downstream supervisor.
- Changed:
  - `nodes/importer-sdk.ts`: an optional `expectedState` on
    `AutomationStudioRecordingMapperCandidate`, and a mapper context `following`,
    the next 32 timeline observations.
  - `runtime/recording-flow-proposal.ts`: the candidate's optional `expectedState`.
  - A new `runtime/service/recordings/proposal-candidates.ts`. It builds the
    mapper calls, keeps a plain-object `expectedState` as a clone and drops
    anything else, and writes it into an approved Flow node's
    `parameterValues.expectedState`.
  - `runtime/service.ts`, from which that construction moved (6919 to 6807
    lines); one export line in `runtime/service/recordings/index.ts`; the new test
    `runtime/service/recordings/tests/proposal-candidates.test.ts`.
  - `docs/architecture/automation-studio.md`, which also gets `w19-c1`'s
    paragraphs, and `automation-studio-native-nodes.md`; both generated
    framework references.
  - `.structure-baseline.json`: `service.ts` file-lines 6919 to 6807;
    `AutomationStudioService` class-methods 224 to 223.
- Why: the downstream W19 fix gives a recorded click a URL claim naming the page
  it landed on. To find that page the mapper needs the entries after the click,
  and the claim must reach the node the executor checks since `6f172b9`.
- Compatibility: additive.
  - A mapper that ignores `following` still type-checks, but code that calls a
    mapper directly must pass it.
  - Stored proposals read as before.
  - With `6f172b9`, a host binding `expectationEvaluator` fails a recorded action
    whose claimed state it rejects. Nothing downstream proposes one yet.
- Decisions:
  - The barrel line outside the brief stands.
  - Approving a proposal as a node definition still drops `expectedState`; that
    is Week 2.
  - An empty `{}` expectation is still kept. The downstream
    `g-core-expectation-record` makes it count as none, and exports the shared
    `expected_state_missing` record.
- Validation: supervisor, from `packages/fluxiq`:
  - `npx vitest run .../recordings/tests/proposal-candidates.test.ts
    --no-file-parallelism` -> `Tests 4 passed (4)`;
  - `.../runtime/tests/service.test.ts` -> `Tests 108 passed (108)`;
  - executor `node-execution` and `transition-comparison` -> `Tests 19 passed (19)`;
  - `pnpm check` -> exit 0, `structure-audit: passed (120 warning(s), 256
    baselined)`, `2 baseline entries can be lowered`;
  - with both lowered, `node scripts/structure-audit.mjs` -> `passed`, nothing
    left to lower;
  - `pnpm docs:check` -> exit 0.
  - Worker: deleting the lift failed the expected-state row. Four more mutations
    (`following`, the plain-object check, the copy, per-mapper construction)
    each failed their row, and all were restored byte-identical.
- Not verified: `pnpm build`; root `pnpm test`; the other proposal-generating
  suites (`service-flow-bootstrap-*`, `apps/web`); the downstream domain compiled
  against these types.
- Outcome: Accepted

### 2026-09-13 — One expectation-rejected record, and an empty expectation counts as none

- Agent: downstream worker `g-core-expectation-record`
  (`reports/g-core-expectation-record.md` in the downstream plan); verified by the
  downstream supervisor, who also brought two architecture sentences up to date.
- Changed:
  - `nodes/policy/expectation.ts` exports `EXPECTATION_REJECTED_FAILURE`, and
    `nodes/policy/index.ts` re-exports it;
  - `runtime/executor/transition-comparison.ts` imports it, and its copy is gone;
  - an `expectedState` with no own keys is not sent to the host
    (`transition-comparison.ts`), and is dropped when a mapper candidate is lifted
    (`runtime/service/recordings/proposal-candidates.ts`);
  - their tests;
  - `docs/architecture/automation-studio.md` and
    `automation-studio-native-nodes.md`;
  - both generated framework references, one citation line
    (`transition-comparison.ts:37` to `:38`).
- Why: `c0e0ce9` kept an empty `{}` expectation, so a host would have been asked
  about the conditions `[{}]` and could fail a recorded action for no reason.
  `6f172b9` had also copied the record.
- Found: importing the policy barrel into the executor creates no cycle, since
  nothing under `nodes/` imports `runtime/`. `{ conditions: [] }` still reaches
  the host, and `expected-transition.ts:8` still records `{}` in the trace.
  Neither changes a verdict.
- Validation: supervisor, from `packages/fluxiq`:
  - `npx vitest run` on `nodes/policy/tests/expectation.test.ts`, the executor's
    `node-execution` and `transition-comparison` tests, and
    `recordings/tests/proposal-candidates.test.ts`, with `--no-file-parallelism` ->
    `Test Files 4 passed (4)`, `Tests 29 passed (29)`;
  - `runtime/tests/service.test.ts` -> `Tests 108 passed (108)`;
  - `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`;
  - `pnpm docs:check` -> exit 0;
  - the tree also held `g-core-start-order`'s bridge edits.
  - Worker: four mutations each failed their rows and were restored identical:
    the executor's empty check, the lift keeping `{}`, counting keys before the
    clone, and a changed shared record.
- Not verified: `pnpm build`; root `pnpm test`.
- Outcome: Accepted

### 2026-09-13 — A client's recording start is ordered with what follows it, and acknowledged

- Agent: downstream worker `g-core-start-order` (`reports/g-core-start-order.md` in
  the downstream plan); verified by the downstream supervisor, who also updated
  `docs/integrations/client-gateway-websocket.md`.
- Changed: `programs/automation-studio/client-gateway/bridge.ts` and its test;
  `docs/architecture/automation-studio/client-gateway.md`;
  `docs/integrations/client-gateway-websocket.md`.
  - **Pending start.** A `client.start_recording` registers a pending start
    before its first await. Every later message from that client waits for it:
    entries, events, snapshots, state updates, errors and Stop. A second start
    waits for the first.
  - **Acknowledgement.** Once the recording is open, the bridge sends
    `server.start_recording` through `gateway.startRecording`, unless a Stop for
    that recording has already arrived.
  - **Refused starts.** A start that is refused or throws is remembered, so what
    waited is discarded and audited under its recording id.
  - **Audits.** A discard audit carries the message's own `recordingId`. Dropped
    snapshots and state updates are audited, except a state update saying its
    client is not recording.
- Why: the downstream `i-recording-loss` investigation found that the bridge
  opened a client-started recording only after `createRecording` returned, while
  the WebSocket host handles one socket's messages concurrently. Everything
  arriving in between was dropped, some of it with no audit, and Core never
  acknowledged a client start. A probe with the pinned bridge kept 8, 3 and 0 of
  8 entries at start delays of 50, 450 and 1000 ms.
- Compatibility: a behaviour change on the wire.
  - Every gateway client that starts its own recording now receives
    `server.start_recording` for it. A client that reads that message as a new
    start must ignore one for a recording it already has; the downstream
    extension's guard is `f-recording-start-guard`.
  - Messages sent during a start are held until it settles, not dropped.
  - It ships in the same minor release as `6f172b9` and `0e6d3ac`.
- Found: `bridge.ts` is 796 of 800 lines, and the class has 26 methods against an
  advisory of 25.
- Validation: supervisor read the diff. From `packages/fluxiq`:
  - `npx vitest run .../client-gateway/tests/bridge.test.ts --no-file-parallelism`
    -> `Tests 20 passed (20)`;
  - then, with this change and the expectation-record change both in the tree,
    `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`, all four packages `check: Done`;
  - `pnpm docs:check` -> exit 0, "Deterministic framework reference is current."
  - Worker: seven mutations each failed their target tests, and all were restored
    byte-identical.
- Not verified: the WebSocket host itself, since the tests call
  `gateway.receive`; two starts in flight; a throw after opening; a Stop crossing
  the acknowledgement; `pnpm build`; root `pnpm test`; the Lab.
- Outcome: Accepted

### 2026-09-13 — A recorded entry keeps the event it came from

- Agent: downstream worker `g-core-action-entry-identity`
  (`reports/g-core-action-entry-identity.md` in the downstream plan); verified by
  the downstream supervisor.
- Changed:
  - `client-gateway/bridge.ts`, one line (still 796 lines): a recording event that
    becomes a recorded input passes its own top-level `eventId` in the envelope
    metadata, in place of any `eventId` in the client's metadata.
  - `runtime/io-bridge.ts`: an action entry and an `input.<role>` observation copy
    the envelope's `eventId` and `sourceId` onto their metadata, each only as a
    non-blank string, and nothing else.
  - Their tests, and `docs/architecture/automation-studio/client-gateway.md`.
- Why: the downstream W19 fix links a recorded click to the page it landed on by
  the click's event id. A click recorded through an IO input became an `action`
  entry with no event id, sequence or source, so no mapper could tell which click
  a landing named.
- Compatibility: additive entry metadata keys, with no contract or wire change. A
  `sourceId` in the client's own metadata takes precedence over the bridge's and
  is now stored on the entry, so it is client-declared, not verified.
- Found: a landing's own `sourceId` stays a top-level entry field that mappers
  are not shown, so a tab-based match without an event id still cannot work.
- Validation: supervisor read the diff. From `packages/fluxiq`:
  - `npx vitest run .../runtime/tests/io-bridge.test.ts
    .../client-gateway/tests/bridge.test.ts --no-file-parallelism` ->
    `Test Files 2 passed (2)`, `Tests 33 passed (33)`;
  - `bridge.ts` is still 796 lines;
  - `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`, all four packages `check: Done`;
  - `pnpm docs:check` -> exit 0.
  - Worker: seven mutations each failed named rows; restored with identical
    SHA-256.
- Not verified: `pnpm build`; root `pnpm test`; the Lab.
- Outcome: Accepted

### 2026-09-13 — The session's behaviour changes released as fluxiq 0.4.0

- Agent: downstream supervisor.
- Changed: `packages/fluxiq/package.json` (0.3.0 -> **0.4.0**), and
  `docs/architecture/package-boundaries.md`.
  - The page's version line now reads `0.4.0`.
  - Its "Unreleased" Migration Notes entry is retitled `0.4.0` and gains a
    paragraph for each other behaviour change since `0.3.0`:
    - a rejected expected state fails the attempt (`6f172b9`);
    - a mapper's `following` and a candidate's `expectedState` (`c0e0ce9`,
      `5ca9981`);
    - a client-started recording ordered with what follows it and acknowledged,
      late messages discarded and audited, and entry `eventId` and `sourceId`
      (`267a2ca`, `73a81e9`, `187f40d`);
    - a value resolved out of state withheld from the persisted trace
      (`5d495eb`).
  - The target-gate paragraphs (`0e6d3ac`) stay verbatim under their own
    lead-in.
- Why: `6f172b9` and `73a81e9` change what a host observes with no opt-in, and
  `0e6d3ac` narrows a published type. That makes this a minor increment with a
  migration note, as the version rule on that page requires.
  `@fluxiq/contracts` and `@fluxiq/client-gateway-websocket` keep their versions:
  `git diff --stat origin/dev..HEAD` over both is empty.
- Validation: supervisor ran `pnpm docs:check` -> exit 0, "Validated local links in
  101 authored/reference Markdown files.", "Deterministic framework reference is
  current."; `node scripts/structure-audit.mjs` -> `passed (121 warning(s), 256
  baselined)`.
- Not verified:
  - `pnpm package:lint` and `pnpm build` on the release tree. Both are deferred
    until downstream Lab Stage 2 finishes, because the lint packs tarballs and
    installs clean consumers, which would load a machine running a load test.
  - Root `pnpm test`.
- Outcome: Accepted

### 2026-09-13 — A client's recording messages are stored in arrival order, and a Stop never touches a recording opened during it (`949fbb4`)

- Agent: downstream worker `g-core-bridge-order`, with two amendments; verified by
  the downstream supervisor. The detail is in the downstream plan's ledger for
  this date.
- Changed:
  - `programs/automation-studio/client-gateway/bridge.ts` and the new
    `client-recording-write-order.ts`;
  - `client-gateway/service/inbound.ts`;
  - tests: `bridge.test.ts`, the new `bridge-restart.test.ts` and
    `client-recording-write-order.test.ts`, and `client-gateway/tests/service.test.ts`;
  - `docs/architecture/automation-studio/client-gateway.md`.
- Why: the WebSocket host handles one client's messages concurrently. So a late
  recorded click was stored before the evidence that revealed its target, and
  downstream W25's wait was never proposed.
- Compatibility:
  - a recorded event now waits for queued snapshots to be written, which reverses
    `0e4edea`;
  - a recording stores its entries in arrival order;
  - a start waits for that client's earlier messages;
  - all three are in the unreleased `0.4.0` Migration Notes.
- Validation: supervisor, on `6621d66`, each command run alone:
  - `pnpm check` exit=0, "structure-audit: passed (122 warning(s), 256
    baselined)";
  - `packages/fluxiq` `npx vitest run --no-file-parallelism` gave "Test Files 136
    passed (136)", and `@fluxiq/web` gave 228 files passed;
  - `pnpm docs:check` exit=0.
  - `pnpm build`: the first run died with a segmentation fault (exit 139) in
    `next build`. That is this machine's faulty-RAM signature. The rerun, alone,
    gave exit=0, "Compiled successfully".
  - `pnpm package:lint` exit=0. For all three packages, publint strict is clean,
    and attw's esm-only profile shows "node16 (from ESM): 🟢" and "bundler: 🟢".
  - Downstream, the W25 Core-order row fails against the old build and passes
    against this one.
- Not verified: a live WebSocket host overlapping a Stop and a start.
- Outcome: Accepted

### 2026-09-13 — Run inputs and resolved values are withheld at rest, and what a run executes is unchanged (`6621d66`)

- Agents: downstream workers `g-core-input-withholding`,
  `g-core-attempt-withholding` and `g-core-withholding-execution`; verified by the
  downstream supervisor. The detail is in the downstream plan's ledger for this
  date.
- Changed, in `packages/fluxiq/src/`:
  - `programs/automation-studio/runtime/service.ts` and
    `storage/project/runtime-stream-store.ts`;
  - `runtime/executor/graph-run.ts`, `node-execution.ts`, `trace-withholding.ts`
    and `contracts.ts`;
  - `runtime/io-policy.ts`, `live-patch.ts` and `composite-executor.ts`;
  - `runtime/contracts.ts`, `service.ts` and `index.ts`, and the new
    `runtime/text-withholding.ts`;
  - tests;
  - `runtime-kernel.md`, `automation-studio.md`, `automation-studio-native-nodes.md`
    and `package-boundaries.md`, and both framework references.
- Why: a downstream Lab run found a declared replay secret in Core's workspace,
  in persisted run inputs and in saved command attempts.
- Compatibility:
  - **Additive types:** `withheldValues`, `FLUXIQ_RUNTIME_WITHHELD_VALUE` and
    `fluxiqRuntimeTextWithholding`.
  - **What readers see:** readers of persisted run inputs, command attempts and a
    trace's input entries see `[withheld]`.
  - **Queued sessions:** a queued session run by `runId` without inputs runs with
    none.
  - **Execution** is unchanged.
  - All of this is in the unreleased `0.4.0` Migration Notes.
- Validation: the supervisor gate recorded for `949fbb4`, which ran on this tree.
- Not verified: the downstream Lab auth-gate leak check against this build.
- Outcome: Accepted

### 2026-09-13 — A command's target is given its timeout, and Core waits 3,000 ms longer for the answer (`b54df69`)

- Agent: downstream worker `g-web-timeout-forwarding`; verified by the downstream
  supervisor. The detail is in the downstream plan's ledger for this date.
- Changed, in `packages/fluxiq/src/`:
  - the new `client-gateway/service/command-answer-margin.ts`
    (`COMMAND_ANSWER_MARGIN_MS = 3_000`), through the service barrel;
  - `runtime/service.ts` and `client-gateway/service/commands.ts`;
  - tests: `runtime/tests/service.test.ts` and `client-gateway/tests/service.test.ts`;
  - `runtime-kernel.md`, `package-boundaries.md`, and both framework references.
- Why: downstream W25 `too-slow` reported Core's `output_dispatch.timed_out`,
  because Core gave up at the node's timeout, the moment the extension did, and
  discarded the extension's `web.action.timeout` answer.
- Compatibility:
  - a command with a positive `timeoutMs` is abandoned 3,000 ms later;
  - an answer inside the margin is reported as the target sent it;
  - both timeout messages name the full wait;
  - all three are in the unreleased `0.4.0` Migration Notes.
- Validation: the supervisor gate recorded for `20bb3b4`, which ran on this tree.
- Not verified: downstream W25 `too-slow` in the Lab.
- Outcome: Accepted

### 2026-09-13 — A Flow with no Start node begins at its graph's root, and a compiled plan follows the same rule (`20bb3b4`)

- Agent: downstream worker `g-core-start-node`; the compiler version bump and the
  verification by the downstream supervisor.
- Changed, in `packages/fluxiq/src/programs/automation-studio/`:
  - the new `runtime/executor/start-node.ts`, exported through
    `runtime/executor/index.ts`, used by `graph-run.ts`; `findStartNode` is removed
    from `graph-navigation.ts`;
  - `runtime/compiled-plan.ts`: the same rule, and `compiled-plan.v2`;
  - tests: the new `runtime/executor/tests/start-node.test.ts`, and rows in
    `runtime/tests/executor.test.ts`,
    `runtime/service/recordings/tests/proposal-candidates.test.ts` and
    `storage/project/tests/compiled-plan-store.test.ts`;
  - `automation-studio.md`, `package-boundaries.md`, and both framework references.
- Why: the project graph index lists a Flow's nodes by id, and a recorded node's
  id carries an unpadded timeline number. A run with no Start node therefore began
  at `entry.10` before `entry.2`. Downstream W15 began at its tab close in 7 of 7
  runs.
- Compatibility:
  - `chooseAutomationStudioStartNode` is a new export;
  - several Start nodes, several roots or no root now refuse before running;
  - a recompiled plan can change `startNodeId` and `planDigest`, and a stored
    plan compiles again under `compiled-plan.v2`;
  - all of this is in the unreleased `0.4.0` Migration Notes.
- Validation: supervisor, each command run alone:
  - mutations: the root rule back to first-by-id failed 11 of 38 tests; a refusal
    falling back to the first listed node failed 4 of 38; an unwired End node
    counted as a root failed 3 of 38; the compiler version back to v1 failed 2 of
    4. Each file was restored identical.
  - `pnpm docs:reference` and `pnpm docs:check` exit=0;
  - `pnpm check` exit=0, "structure-audit: passed (123 warning(s), 256
    baselined)";
  - `packages/fluxiq` `npx vitest run --no-file-parallelism` gave "Test Files 137
    passed (137)" and "Tests 955 passed (955)"; `@fluxiq/web` gave 228 files
    passed, and contracts and gateway-websocket 1 file each;
  - `pnpm build` exit=0, "Compiled successfully", on its first run;
    `pnpm package:lint` exit=0, with attw's esm-only profile "node16 (from ESM):
    🟢" and "bundler: 🟢".
- Not verified: the downstream Lab recheck; a stored artifact recompiling in a
  live host; the web panel showing a refusal message.
- Outcome: Accepted

## Open Questions

- **A client's declared identity is not authenticated, so nothing that gates on
  it is a boundary.** In `packages/fluxiq/src/client-gateway/service/lifecycle.ts`,
  `handleHello` calls `applyHello` at line 73 — before the token check on line 74
  and unconditionally — and `applyHello` assigns `session.clientType` (line 85)
  and `session.capabilities` (line 88) straight from the `hello` frame. The token
  path that follows binds only the identifier: `resumeTrustedSession` rejects
  unless `trustedClient.clientId === session.clientId` (line 99) and never
  reconciles the declared type or capability list against what was paired. So
  both values are client-supplied claims for the whole life of the session,
  including after the session becomes ready.
  The consequence downstream, raised 2026-09-12: the extension-only filter in
  `domain/src/io/gateway-output-dispatcher.ts:44-56` (mirrored in
  `domain/src/runtime/adapter.ts:136-147`) selects sessions by
  `clientType === "extension"` plus a declared `web.actions` capability, so it is
  a convention for picking the right client, not an authentication. Downstream
  redaction guards that honour a client-declared flag are therefore defence in
  depth against our own producers, not protection against a hostile client, and
  the same holds for anything else in Core or a domain that reads those two
  fields. An enforceable boundary would have to bind the declared type and
  capabilities to the trusted client at pairing time, where the operator's
  approval already is, and refuse or re-derive them on reconnect. Not designed
  here, deliberately: it changes the pairing contract and both sides of the
  gateway. Raised by downstream work 2026-09-12; owner: senior supervisor agent
  (Core).
- **Problems-panel visibility uses an exact view-ID match.**
  `useAutomationGraphRuntime.ts` compares the Problems view with `===`, while
  scoped views can carry object-qualified IDs. It is correct today because
  Problems opens only with the plain ID; if anything opens it with the qualified
  form, graph validation stops without an error. Not changed: the intended
  behaviour is undocumented and the area belongs to other Automation Studio
  plans. Raised with the user 2026-09-11; owner: senior supervisor agent.
- **Two runtime service tests are load-sensitive, and their teardown hides why.**
  In a full `pnpm test` run sharing the machine with other work,
  `runtime/tests/service.test.ts` (turns mapped observations into reviewed Flow
  actions) and `runtime/tests/service-flow-bootstrap-adaptation.test.ts` (bridges
  a generated proposal ID through the PIN-gated endpoints) exceed the 15 s
  `testTimeout` in `packages/fluxiq/vitest.config.ts`. Run alone, the same two
  files pass: `Tests 147 passed (147)`, exit 0. The timeout aborts the body
  before every service reaches the set that `afterEach` closes, so removing the
  temporary directory fails with `EBUSY ... unlink project.sqlite-shm`, and that
  is the error vitest reports instead of the timeout. Two defects, not one: the
  setup cost that makes 15 s tight, and a teardown that masks the real failure.
  Raised 2026-09-11; owner: senior supervisor agent.
  Update, after core-adaptation-test-cost: the cost half is fixed. The case runs
  12110 ms under full-suite load, from 14685 ms, against the unchanged 15 s gate,
  by seeding the fixture once and copying it per case; the directory removal now
  retries so an EBUSY cannot replace the failure a run is reporting. The cause of
  the EBUSY is still unidentified, and two hypotheses are now disproved. Mine,
  that a service escapes the set `afterEach` closes, and the worker follow-up
  suggestion to call `await repository.close()` on the repository opened directly
  in the Subflow-scale case: `SQLiteRepository` holds no handle between
  operations, since every operation opens and closes inside a `finally`
  (`database-manager/storage/sqlite-repository.ts`), and the class exposes no
  `close` method at all, so that call would not compile. The masking was never
  reproduced, so the retry is verified only as not breaking passing runs, and the
  residual cost is source-side SQLite persistence, so a slower machine can still
  exceed the gate.
- **A TypeDoc reference case loses its budget by a hair under load.** In
  `programs/tests/global-docs.test.ts`, the case generating the TypeDoc-backed
  framework reference timed out at 15041 ms against its own explicit 15 s budget
  in one full-suite run, and passed in three others, including a supervisor run
  at 828 of 828. The budget was set on 2026-09-10 in `e55a141`, so it is not a
  stale number. The cost is inherent: the case runs TypeDoc across the whole
  repository. The same suite already budgets two comparably heavy cases at 30 s.
  Not changed, deliberately: widening a gate that currently passes lowers
  sensitivity rather than fixing anything, and making the generation cheaper, or
  moving it out of the unit suite, is a Core design call. Raised 2026-09-11;
  owner: senior supervisor agent.
