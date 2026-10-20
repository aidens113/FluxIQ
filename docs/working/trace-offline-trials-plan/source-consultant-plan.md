# Source: FluxIQ Core Recorded Environments Implementation Plan (consultant)

Supplied by the user on 2026-10-19 and kept as the source of [the plan of record](../trace-offline-trials-plan.md),
which renames "recording" to trace and "replay" to offline trial and records the supervisor's changes. Text below is
the consultant's, unchanged in substance.

Status: Proposed implementation plan
Created: 2026-10-19
Scope: FluxIQ core and the web extension's integration with core
Primary objective: Reduce flow-creation and repair time by reusing complete runtime recordings for internal state testing and execution replay.

## 1. Goal and binding requirements

Build a core capability that records real exploration, testing, and flow execution, then runs candidate flows against those recordings through the normal FluxIQ runtime.

The defining requirement is: for a supported recorded scenario, core must receive the same data, through the same runtime interfaces, that it would receive during real exploration, testing, or execution.

The web extension must support an internal state testing recording mode while it interacts with the real website. That mode captures the actual data supplied to core, together with the external operation requests and outcomes needed to replay it. Other clients must be able to participate through the same core contract.

This is an implementation plan based on the agreed architecture and requirements. Component names below describe responsibilities; implementation agents must map them to current repository abstractions before adding new modules. No current repository paths or existing implementation details are assumed.

### Required invariants

1. Exact core-visible input parity. Preserve the payload contents, types, field presence, errors, event ordering, and referenced data visible at the chosen runtime boundary. A reduced summary is not an exact recording.
2. One runtime implementation. Replay uses the same state ingestion, reducers, node implementations, executor, routing, subflow handling, event handling, and verification code as live execution.
3. Domain-neutral core. Core owns recording, persistence, replay orchestration, verdicts, and authoring integration. Domain packages own environment-specific payload meaning and optional offline query resolution.
4. Real execution with recording. Enabling recording does not replace live exploration or testing with a mock environment. The client still performs its normal real operations.
5. Candidate computation is executed. Reconstruct external inputs and observations; recompute the edited flow's decisions, variables, outputs, and internal execution context.
6. Recorded outcomes require supported interactions. Supply an action or query result only when the candidate's operation and context have adequate recorded support.
7. Unknown behavior stays unknown. Unsupported actions, arguments, queries, or schedules produce explicit evidence gaps. They must not receive an invented success state.
8. Replay is isolated from live effects. A replay cannot silently fall back to the real client, network, external store, or other effectful integration.
9. Verification retains provenance. Replay passes do not become new live successes or reduce live-verification frequency.
10. Evidence is durable and complete for its declared scope. Missing payloads, broken delta chains, unavailable artifacts, and incompatible versions prevent affected scopes from passing.

### Desired operating loop

Live exploration and recording, then candidate authoring, then offline replay and repair, then focused live evidence collection where necessary, then final live validation, then a reusable flow and additional recordings.

A sufficiently covered task may require only one final live validation after multiple offline iterations. The system must also support incremental exploration when evidence is incomplete.

## 2. Scope of the first release

Included:

- A shared capture contract for exploration, testing, and ordinary execution.
- An internal state testing recording mode in the web extension and core integration.
- Lossless capture of the inputs actually consumed by core.
- Persistence of action/query requests, acknowledgments, results, errors, events, and required artifacts.
- Reconstruction through the normal core input path.
- The normal executor running against a replay environment.
- State checks, pure computations, and conservative replay of recorded trajectories.
- A virtual clock for supported recorded timing.
- Structured failures and evidence gaps suitable for the authoring model.
- Integration into build, test, and repair decisions.
- A final integrated live validation before a newly created flow is considered live-confirmed.
- Meaningful parity, isolation, regression, and outcome-verification tests.

Deferred:

- General simulation of arbitrary unseen application behavior.
- Automatic merging of unrelated traces based on visual similarity or state fingerprints.
- Arbitrary reordering of external actions without a supporting contract.
- A universal browser or website emulator.
- Cross-task parameter substitution without explicit equivalence and binding rules.
- New event-node semantics developed specifically for replay.
- Optimizing scenario selection before conservative replay is working and measured.

The existing or separately planned event-node system remains authoritative. Replay must use its production semantics as those capabilities become available.

## 3. Define exactly what "the same data" means

### 3.1 The capture boundary

Identify the canonical point where client data becomes input to core's runtime. Record immutable copies of the actual accepted messages there, before downstream consumers can mutate or discard their contents.

Capture must happen before lossy runtime summaries if the unsummarized data is visible to any core component. If the normal client protocol already supplies normalized state, record that exact normalized state and every additional input core can obtain through other interfaces.

Use the same decoder, validation, dispatcher, reducer, and subscription path during replay. Do not populate a special replay-only state object that bypasses normal ingestion.

Transport-only details may be excluded only after documenting that they cannot influence core behavior. Every behaviorally relevant timestamp, identity, context, field, and ordering relationship must be retained.

### 3.2 Input surface inventory

| Surface | Required capture |
| --- | --- |
| Initial run context | Task instructions and inputs, relevant configuration, capabilities, catalog/schema versions, and initial external context |
| State snapshots | The complete payload core received, including fields unused by the original flow |
| State updates | Exact deltas/patches, removals, base revisions, and delivery order |
| Client events | Unsolicited events and their context, including events between action invocation and completion |
| Action lifecycle | Request, acknowledgment if present, progress if core sees it, completion, returned outputs, errors, and cancellation |
| Queries and tools | Request arguments and the exact returned values or errors |
| Artifacts | Required file/blob/image contents and metadata, not merely temporary paths or expiring URLs |
| Nondeterministic services | Clock, randomness, model responses, and external reads that can affect core decisions |
| External control | Relevant pause/resume, cancellation, or other controls consumed by the runtime |

Capture only data that belongs to the actual runtime contract. The feature does not require downloading every piece of a website merely because it exists.

### 3.3 Fidelity rules

- Preserve omitted fields versus explicit null, empty collections, numeric values, and contract-defined types.
- Preserve valid extension fields instead of dropping them through a narrower recorder schema.
- Record binary contents with a lossless representation and integrity checks.
- Replace non-serializable handles only through an explicit versioned representation that preserves the behavior core is allowed to observe.
- Preserve domain identifiers, payload values, and core-visible identity relationships exactly. Limit any translation to documented transport correlation bookkeeping outside domain interpretation, with source evidence unchanged. Reproduce recorded identifiers when core or candidate logic can observe them, and never normalize away arbitrary differences in the parity harness.
- Treat redaction or truncation that changes runtime-visible data as a declared fidelity limitation. Such evidence cannot pass an exact-parity gate for the affected scope.
- Preserve the order actually delivered to core. Source timestamps alone cannot reconstruct the order of concurrently arriving messages.
- In original-version parity tests, replayed inputs and derived core state must match the recorded run at the corresponding boundaries.
- For an edited candidate, internal results may intentionally differ. Input parity does not require reproducing the original flow's decisions.

### 3.4 Queries over captured data

A candidate can perform new computations over data already available in its current replay observation, even if the original flow never used those fields.

A new external query is supported only when (1) its answer can be evaluated faithfully from the current captured data through shared domain logic, or (2) a compatible recorded request/result exists for that context. Otherwise report missing evidence. Never substitute the answer to a different query or reveal data from a later observation.

## 4. Architecture and ownership

| Proposed responsibility | Behavior | Owner |
| --- | --- | --- |
| Live environment adapter | Routes ordinary observations, actions, queries, and events between the client and core | Core boundary plus client integration |
| Recording observer | Captures immutable accepted inputs and outbound operation requests without changing their semantics | Core |
| Recording store | Persists manifests, ordered events, snapshots/deltas, and artifacts | Core |
| Replay environment | Delivers supported recorded inputs and intercepts external operations | Core |
| Runtime input path | Decodes, validates, dispatches, and reduces both live and replayed data | Existing core runtime |
| Scenario runner | Runs a candidate from declared inputs against a recording or scoped fixture | Core |
| Replay report | Records verdict, evidence origin, supported scope, diagnostics, and missing evidence | Core |
| Domain replay support | Supplies optional faithful target/query resolution or explicit simulation rules | Domain package |
| Build/repair integration | Uses replay results to revise candidates or request live evidence | Core |

Execution configuration keeps three concepts independent: activity (exploration, test, or execution), environment (live or replay), and recording purpose (off or internal state testing). Examples: live exploration with recording; live flow test with recording; live normal execution with recording enabled by policy; replay test using an existing recording. Recording policy must be supported consistently across all three activities. Default authoring exploration and tests to capture once the feature's rollout gates pass. Ordinary execution can follow an explicit recording policy so storage and overhead remain controlled.

Replay-generated reports and diagnostic traces retain recorded or modeled provenance. They must never be ingested as new live observations merely because they use a similar storage format.

## 5. Recording contract and lifecycle

### 5.1 Manifest

A recording manifest should identify: recording ID and original live episode ID; activity and evidence origin; recording schema and capture-boundary versions; runtime, client, domain, state, action, and query contract versions needed for compatibility decisions; relevant catalog/capability configuration; task inputs and the version of the task-goal contract; environment/session/resource context required to interpret the trajectory; starting observation and available checkpoints; streams and logical clock origin; artifact inventory with integrity information; completeness state and any missing ranges or fidelity limitations; recording start, closure, and termination reason. Keep raw evidence immutable after capture. Store indexes, summaries, evaluations, and proposed scenario variants separately.

### 5.2 Event envelope

| Field category | Purpose |
| --- | --- |
| Identity | Recording ID, event ID, stream/context identity |
| Ordering | Authoritative core-delivery sequence and relevant source sequence |
| Time | Logical/relative timing and original timestamps where core observes them |
| Kind | Snapshot, delta, client event, request, acknowledgment, result, error, control, or artifact reference |
| Correlation | Request ID, causation information when known, observation revision and base revision |
| Schema | Payload contract and version |
| Payload | The actual core-visible data |
| Artifacts | Immutable references to captured content |
| Provenance | Original episode and evidence origin |

Do not assume the next observed state change was caused by the immediately preceding action. Preserve explicit correlations when available and leave causality unknown when it is unknown. Record repeated requests separately; identical request text can legitimately return different results at different points in a run.

### 5.3 Artifacts and deferred reads

If live core can read a downloaded file, screenshot, DOM artifact, blob, or other resource, replay must be able to supply the contents that were available at the appropriate point: persist necessary bytes before their original source can disappear; preserve media/type metadata and resource identity; capture each relevant revision of a mutable resource; supply resources through a replay artifact resolver or equivalent existing abstraction; record deferred external reads if their contents were not already captured; treat a missing artifact as missing evidence; do not fetch from an original URL or local live path as an implicit replay fallback.

### 5.4 Recorder reliability

Implement start, append, flush, and close behavior with explicit completeness status. Use immutable copies or an equivalent immutable data model so later mutation cannot alter historical evidence. Buffering, compression, and chunking must preserve the accepted input stream. Recorder failures must be visible; if ordinary live work continues after a recorder failure, mark the affected recording incomplete immediately, and never claim exact replay coverage after silently dropping events. Measure capture overhead and avoid unbounded buffering. Existing access and storage boundaries also apply to recordings and their artifacts.

### 5.5 Evidence access and memory use

Persist recordings independently from process memory. Provide indexed reads of event ranges, observation revisions, operation boundaries, and artifact contents so replay can load the data it needs incrementally. The runtime must have faithful access to its current supported inputs; this does not require injecting the entire recording into an authoring model's context. Supply concise diagnostics and evidence references, with normal tools for retrieving the relevant original payloads. Summaries and search indexes support navigation; they never replace the runtime's recorded inputs. An original process or client session must not need to remain alive for a completed recording to be replayed.

## 6. Web extension implementation requirements

The web extension is the first production integration, using the core contract. Required behavior: support the internal state testing recording configuration for live exploration, tests, and execution; continue sending its normal runtime payloads through its normal transport; coordinate session/context IDs, observation revisions, sequence information, and operation correlations with core; make all data normally readable by core persistable or reproducibly available from the captured episode; preserve DOM/structured state, screenshots, target metadata, frame/tab identity, and other payloads only to the extent they are part of the actual runtime interfaces; capture action acknowledgments, completion, errors, and event updates using the same semantics as ordinary operation; persist any artifacts core can read beyond the immediate message payload; close recordings consistently on normal completion, failure, cancellation, navigation loss, or disconnection; surface incomplete recordings when extension or transport interruption loses required data.

Prefer capture at shared transport and core ingress points over maintaining a second browser-specific "test recording" serializer. The recording mode can add capture metadata and persistence work; it must not send core a smaller or simplified state representation.

Browser-specific offline queries: if core requests browser-specific queries, put faithful offline evaluation in the browser domain integration. Use captured structure and the same query/target semantics where practical. A changed selector that resolves to the same captured target may support a recorded action only under an explicit matching rule. A screenshot or partial element listing does not imply availability of an arbitrary DOM query. Return a coverage gap when the necessary information or resolver semantics are absent.

## 7. Replay semantics

### 7.1 Start and reconstruction

1. Validate manifest completeness and relevant contract compatibility.
2. Load the recording and required artifacts without connecting to the real client.
3. Initialize the normal runtime with declared task inputs and the candidate flow.
4. Deliver the initial recorded inputs through the ordinary ingress.
5. Reconstruct observations using the normal snapshot/delta/event processing.
6. Run the candidate so its variables, decisions, outputs, loops, and subflow context are freshly computed.

Use the original flow version to establish a baseline parity test. Then allow edited candidates to make different internal decisions.

### 7.2 External operations

When the candidate requests an external operation: inspect its type, arguments, target, input bindings, and relevant trajectory context; match it to a supported recorded occurrence or evaluate an allowed pure query over current captured data; preserve the distinction between acknowledgment, progress, completion, and confirmed effects; deliver the matching result and subsequent supported events at the appropriate logical points; if support is missing or ambiguous, return a structured evidence gap and do not consume an unrelated recorded suffix. A mismatch is not automatically a faulty candidate; it may represent a legitimate alternative whose outcome has not been observed. Internal node IDs and graph layout must not be the primary matching key; refactoring subflows can preserve the same external interaction sequence.

### 7.3 Visibility and time

- The authoring model/debugger may inspect the complete corpus as evidence.
- The executing candidate sees only the state available at its current supported logical point.
- Replay indexes and artifact catalogs must not expose future observations to ordinary runtime state reads.
- Use a virtual clock while preserving logical delays, timer decisions, and event ordering.
- Replay the observed schedule initially; additional schedules are explicit scenarios.
- For action-relative events, retain the recorded timing and correlation rules.
- If a candidate introduces timing or concurrency behavior the recording cannot establish, report the unsupported scope.
- Repeated reads of current captured state must not accidentally advance the trajectory.
- Recorded model responses may be reused only for compatible requests. Changed model inputs need separate evaluation, and any new model call remains explicit.

### 7.4 Checkpoints

Distinguish an observation checkpoint (external data available for inspection or a scoped test), an executor checkpoint (internal state valid for a compatible flow continuation) and a live restore point (an operation that actually restores the real client environment). The first release may replay a cheap prefix instead of restoring old executor context. A changed upstream computation must not inherit the original flow's computed variables. A local subflow fixture must declare its supplied inputs and starting state; passing it does not establish that the full candidate can reach that state.

### 7.5 Boundaries of evidence reuse

Start with independent trajectories and explicitly supported segments. Do not join traces solely because their screenshots, URLs, or state hashes match. Preserve resource identity, relevant prior writes, task bindings, session context, and pending events. New live probes may add evidence, but their results are reusable only in compatible contexts. A probe segment is not automatically a continuation of every similar snapshot.

## 8. Evaluation and authoring integration

Result contract, as independent fields rather than one overloaded success flag: verdict (pass, fail, inconclusive); evidence_origins (recorded, pure_computation, live, modeled); scope (supplied_state, segment, full_recorded_path); candidate_revision; goal_contract_version; source_episode_ids; supported_observations_and_operations; assertions_checked; reason_codes; missing_evidence. A full recorded path is still a historical scenario. Only an actual live run with the required checks can create a live-confirmed outcome. Useful reasons include missing transition, argument mismatch, ambiguous context, missing artifact, incomplete capture, incompatible contract, unsupported timing, and assertion failure.

Preserve task-goal verification: maintain the task-goal contract independently from candidate edits; run candidate computations on captured source data; evaluate required outcomes using the available evidence; preserve raw evidence when the candidate changes; allow stronger diagnostic checks without weakening the original task requirements; treat unavailable outcome evidence as unverified, even if a success notification was recorded.

Build and repair behavior: (1) run static/contract checks already required by authoring; (2) evaluate the candidate against relevant recorded scenarios; (3) use demonstrated failures to drive local edits and another replay; (4) turn evidence gaps into focused exploration requests; (5) execute probes through the existing live execution and authorization path; (6) record the resulting inputs and outcomes; (7) reuse new evidence only with established context compatibility; (8) perform final integrated live validation; (9) record final success or failure and retain the resulting regression scenario. A probe request should identify its task, starting context, missing query/action/outcome, assertions to establish, and completion condition; reaching its starting point may require a live prefix or reset operation. Use existing retry and side-effect handling for probes. A recording is not permission to repeat an operation whose effect may already have occurred.

Reliability accounting: track separately distinct live episodes and independently verified live outcomes; replay evaluations and regression coverage; synthetic or modeled scenarios. Replaying one live episode any number of times must not increase live-success counts or reduce the frequency of future live verification. Preserve episode provenance through derived fixtures and reports.

## 9. Implementation phases

- **Phase 0, map existing interfaces and establish a baseline.** Inspect core and extension instructions and current state/action/query interfaces; trace inputs used during exploration, flow tests, and normal execution; inventory direct external reads and effects that bypass the shared client boundary; identify every artifact or lazy resource reference core can dereference; identify current recording/storage formats, state reducers, clocks, and test-lab fixtures; map current authoring, validation, repair, and verification-accounting paths; record baseline timings for representative lab tasks; document which required pieces can extend existing code and which are missing. Deliverables: interface inventory, input-surface map, chosen capture boundary, compatibility strategy, baseline measurements. Gate: every known external input affecting core has a proposed capture/replay route or an explicit unsupported status; no assumed repository APIs remain in the design.
- **Phase 1, establish the core recording and environment contracts.** Define the manifest, event envelope, completeness model and artifact references; define activity, environment and recording configuration independently; introduce or extend the shared environment interface; ensure the normal executor receives that dependency without a separate implementation; define version compatibility and canonical payload comparison; define result scope, evidence origin and missing-evidence reason codes; define how each external-effect bypass is redirected or marked unsupported; demonstrate that the contract contains no required browser-specific fields. Deliverables: implemented contracts and configuration, an initial store interface, a small non-browser fixture adapter. Gate: both the web integration and the non-browser fixture express their runtime inputs without client-specific behavior in core.
- **Phase 2, implement live internal state testing recording.** Passive capture of accepted core inputs and outbound operation requests; integration into web extension exploration, testing and execution; preserve snapshots, updates, delivery order, correlations, results and errors; persist artifacts and lazy-read outcomes; indexed event/artifact reads that survive restart; recorder lifecycle, integrity validation and incomplete-recording behavior; immutable history; existing persistence where suitable; measured overhead and bounded buffering. Gate: captured payloads reproduce the actual runtime input values without field loss; a deliberately interrupted recording is explicitly incomplete; recording-enabled deterministic lab runs preserve ordinary observable behavior.
- **Phase 3, prove replay input and state parity.** Load and validate complete compatible recordings; feed recorded inputs through the same canonical ingress; reuse normal reducers, dispatchers and subscriptions; artifact resolution without original temporary resources; reconstruct snapshot/delta chains with revision validation; compare recorded live inputs with replay ingestion and reducer outputs; separate the candidate's current observation from whole-recording inspection; explicit behavior for missing fields, artifacts, broken sequences and incompatible schemas. Gate: ingestion and reducer replay match the captured stream and resulting observation state; missing or incompatible evidence cannot silently become a pass.
- **Phase 4, execute candidate flows against the replay environment.** Production executor with replay dependencies; recomputed variables, expressions, transformations, routing and node outputs; conservative action/query matching with occurrence and trajectory context; supported acknowledgments, results, failures and events; virtual time and supported schedule; original-runtime parity before edited candidates; faithful pure queries; blocked implicit live effects; evidence-linked diagnostics, verdicts and gaps; whole scenarios and scoped subflow fixtures; production retry/event behavior; bounded memory over large recordings. Gate: the original flow reproduces its external interaction sequence and outcome; a broken candidate mapping or condition is detected; an internal refactor preserving supported interactions remains replayable; a new action or argument cannot receive the old successful suffix; a large recording is usable after restart without loading the full corpus.
- **Phase 5, integrate replay into creation and repair.** Replay after revisions that previously required another live test; concise diagnostics with evidence references; demonstrated bugs to local repair; missing evidence to focused live exploration; reuse valid live starting contexts or execute the needed prefix/reset; record every probe and final live validation; immutable task requirements and provenance; live confirmation and replay validation distinct; live-success accounting deduplicated by live episode; a budgeted live-validation path when coverage is insufficient. Gate: a representative task performs multiple offline revisions, acquires an unsupported transition when required, and completes final live validation; replay count has no effect on live-verification decay.
- **Phase 6, validate usefulness and roll out.** Run the acceptance matrix; compare tasks with replay off and on under comparable budgets; include successes, recoverable failures, parameter changes, incomplete recordings and uncovered branches; measure total creation time; investigate replay-pass/live-fail cases; measure storage, memory and throughput overhead; enable default recording and replay-first validation after their gates; document supported scopes. Gate: a repeatable reduction in live iteration cost and total creation time without degraded final task success.

Dependency guidance: Phase 0 informs the contracts; resolve the capture boundary before separate teams implement competing formats. After Phase 1, core persistence and extension integration can proceed in parallel. Artifact handling and parity fixtures can proceed alongside capture. Phase 3 parity precedes trusting Phase 4 verdicts. Phase 4 behavior and isolation gates precede automatic authoring integration. Phase 5 provenance and goal checks precede rollout. Keep one owner for the runtime input contract and one shared production executor throughout.

## 10. Required acceptance-test matrix

| ID | Scenario | Expected result |
| --- | --- | --- |
| T01 | Record snapshots, deltas, nested fields, extension fields, empty values, explicit null, and absent fields | Replayed typed inputs match what core actually received; no recorder schema silently removes fields |
| T02 | Run a deterministic lab scenario with recording enabled and disabled | Ordinary decisions, commands, and task outcome remain equivalent; capture overhead is measured |
| T03 | Replay real exploration, test, and normal-execution recordings | All activities use the same parity contract and normal runtime ingestion |
| T04 | Mutate a live payload object after its input was accepted | Historical recording contents remain unchanged |
| T05 | Change candidate extraction, a threshold, or a variable calculation | Edited logic executes and produces its own result; old node outputs are not restored |
| T06 | Add a pure computation using previously unused fields already present in the current observation | Computation succeeds without requiring the old decision sequence |
| T07 | Change an external action's arguments, target, or ordering beyond recorded support | Explicit evidence gap; original next state and success result are not supplied |
| T08 | Issue the same query twice with different recorded results | Matching respects occurrence and context rather than returning the first cached response |
| T09 | Introduce a new external query | Evaluate faithfully from current captured data if supported; otherwise return a gap |
| T10 | Attempt to read a later observation or artifact before its delivery point | No future-state leakage into candidate execution |
| T11 | Delete the original temporary file or expire the source URL | Captured artifact contents remain readable, or missing evidence is reported |
| T12 | Record acknowledgment, unsolicited state event, then completion | Replay preserves correlation and core-visible order; acknowledgment is not treated as completion |
| T13 | Replay completion before and after a timeout deadline | Production timeout logic observes the correct logical duration with minimal wall-clock waiting |
| T14 | Truncate a trace, break a delta base, remove an artifact, or use an incompatible contract | Reject or mark affected scope inconclusive; never silently fill gaps |
| T15 | Refactor node IDs/subflow structure while preserving supported external interactions | Replay remains valid and the candidate builds its own execution context |
| T16 | Test a recorded interruption with supported retry/event handlers | Production scopes, priorities, retry limits, and resumption behavior are exercised |
| T17 | Use visually identical states from episodes with different resource/history context | No unsupported automatic transition merge |
| T18 | Reach a recorded success notification with the wrong task output | Independent goal verification fails or remains unverified |
| T19 | Replay one successful live episode 1,000 times | Live-success counts and verification-frequency decay remain unchanged |
| T20 | Attempt an unsupported live client/network/store operation during replay | Operation is blocked and classified; no implicit live fallback occurs |
| T21 | Acquire a missing transition through a real probe | Result retains real context/provenance and is reusable only where compatible |
| T22 | Change a recorded model request's input | Old completion is not silently reused as if it answered the new request |
| T23 | Reuse an old executor checkpoint after an upstream candidate edit | Reject incompatible resume or replay the prefix; do not inherit stale computation |
| T24 | Persist or export a replay-generated diagnostic trace | Its origin remains recorded/derived and cannot create a new live success |

Use an existing lab task for the main end-to-end fixture and a small non-browser adapter to verify that the contract is genuinely domain-neutral. Avoid building a second full production client solely for testing.

## 11. Metrics and rollout decisions

Track per task and candidate revision: total time to a live-confirmed successful flow; exploration, authoring/model, replay, live-test, probe-setup, and final-validation time; live action count and repeated traversals; replay-supported scopes and evidence gaps by reason; distinct real episodes versus replay evaluations; replay-pass/live-fail cases and causes; capture overhead, bytes recorded, artifact volume, and replay memory; model cost per successfully completed task; final live task success across the comparison set. Use comparable inputs, fixtures, model configuration and evaluation criteria. Report both validation-stage savings and total creation savings. Do not promise a fixed multiplier before measuring the existing loop. Choose performance targets from Phase 0 measurements. Exact input fidelity and honest unknown handling remain required even when a faster approximation is available.

## 12. Definition of done

Core has a domain-neutral recording/replay contract; the web extension records the same core-visible data during real exploration, testing and execution; required external artifacts survive beyond their original live resources; recorded inputs reconstruct state through the normal ingestion path; original-version live/replay parity is demonstrated; edited candidates run through the actual executor and recompute internal state; recorded results are conditioned on supported operations and context; unsupported consequences produce evidence gaps instead of fabricated success; replay cannot silently invoke real external effects; task-goal verification remains independent of candidate edits; replay evidence does not inflate live reliability or accelerate verification decay; the build/repair loop uses replay before avoidable live retesting; missing evidence can be acquired through deliberate recorded live probes; newly created flows receive integrated live confirmation; representative tasks demonstrate useful end-to-end savings.

## 13. Later extensions

After the first release is measured and stable: dependency-based selection of recordings affected by a candidate edit; additional checkpoint reuse with explicit compatibility checks; domain-supplied parameterized fixtures and symbolic resource bindings; cross-recording transitions with declared equivalence rules; additional timing and failure scenarios with explicit modeled provenance; optional client-supplied transition models for supported unseen actions; improved compression, indexing and retention. All extensions preserve the same boundary: recorded observations establish historical evidence; modeled outcomes describe assumptions; live confirmation establishes a new real execution.

## 14. Design references

The requirements and architecture come from the FluxIQ discussion and are proposed implementation decisions. Related mechanisms, not dependency requirements: Temporal workflow replay (rerunning workflow code using recorded history, external activity results and replay-compatible time); Playwright mocking and HAR replay (explicit matching of recorded request/response interactions); rrweb's replay sandbox (reconstruction of recorded DOM effects with page scripting disabled, showing why visual replay alone does not define arbitrary new application behavior).

Core implementation rule: feed the actual runtime with faithful recorded inputs, execute the candidate's real logic, and acquire new live evidence whenever the recording cannot establish an external consequence.
