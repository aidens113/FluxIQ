# Execution-derived admission review

Outcome: Done — report-only review; implementation is not authorized by this report.

The proposed one-use candidate permit is a sound separation from ordinary repeat protection. It is not sufficient to authorize another live trial today. The existing gateway command journal is the right source of durable command facts, but it does not cover native invocation, arbitrary dispatch callbacks, trial-start hooks, or all post-receipt handling failures. Neither a new in-memory build scope nor an empty run-scoped query can prove those paths clear after a new run ID or restart.

The smallest truthful repair reuses that journal, adds durable execution coverage and continuation/resource association beside it, and supplies private producer/consumer ports to the actual invocation boundaries. Candidate/loop wiring can proceed against fixed ports in parallel; granting its positive live exception must wait for the production coverage and durable admission implementation.

## Scope and validation

Reviewed `briefs/execution-admission-review.md`, the working document's Current State, `reports/candidate-retest-protocol.md`, and the source owners listed below in the t843 Core worktree. Source inspection used `rg`, `rg --files`, and `Get-Content`. Existing tests were inspected as evidence of intended contracts; none were executed.

No source, test, package, build, provider, browser, panel, git, or other checkout actions were performed. This report is the only authored file. The recommendations below are design conclusions from source, not verified behavior of a new implementation.

All source paths below are relative to `packages/fluxiq/src/` unless stated otherwise. The shorthand **Studio runtime** means `programs/automation-studio/runtime/`.

## What existing authority actually establishes

| Owner | Authoritative fact available now | Limit relevant to the proposed repair |
| --- | --- | --- |
| `client-gateway/service/command-ledger/controller.ts` | Awaits a durable exact claim before its transport callback; exact replay does not send again; validates and commits authenticated receipt facts. | Command identity includes `runId`. This is exact-command deduplication, not a cross-run build/resource admission query. |
| `client-gateway/service/command-ledger/{context,outcome,dispatch}.ts` | Original opaque context ownership, one registered outcome observer, real client/session binding, and short-lived completion proof bound to that exact observer/context. | A caller-created context is not automatically accepted by the configured ledger resolver. A second observer or copied JSON receipt cannot reproduce this authority. |
| `programs/automation-studio/storage/project/command-ledger/{store,migration,admission}.ts` | Transactional project claims, receipts and unknown history linked to mutation proofs; joined inventory validation; same-run admission and private consumption checks. | Inventory/admission is selected by one run ID. Consumption clearance is held in memory. There is no logical-build/resource association or durable terminal coverage seal. |
| `programs/automation-studio/runtime/service/command-run/controller.ts` and `command-execution/controller.ts` | Actual engine provenance, authentic completion/handling consumption, and fail-closed required-run checkpoints. | Several refusal/uncertainty latches exist only in private state. A fresh run ID has a distinct admission. The existing required owner must remain authoritative. |
| `programs/automation-studio/runtime/service/command-execution/lifecycle.ts` | Explicit `commandOutcomeMode: "required"` sessions bind the required controller and stored session. | Ordinary candidate/subflow trial graph options do not become required-command sessions through this path. Turning the flag on globally would also reject currently unsupported native/custom execution. |
| `runtime/service.ts` and `runtime/storage.ts` | Runtime attempt/session telemetry and persistence. | Attempt writes are queued rather than awaited before dispatch. `FileRuntimeStore` tolerates unreadable JSON by returning fallback data. These records cannot certify a complete pre-send safety inventory. |

The project command store's introductory comment says closed run admission is not wired; actual required-session lifecycle/controller code does wire it. The implementation, rather than that comment, was used for this assessment.

`store.readRun(runId)` is informational: it returns validated records and historical unknown IDs, not a consumed clearance capability. `openRunAdmission(runId)` refuses prior records for that run. `claimForRun` also preserves historical unknown refusals, even when a receipt later makes the current row committed. These protections must not be weakened to make candidate retries convenient.

`tests/process-restart.test.ts` exercises process interruption and an exact claim replay; pending is unknown and a committed replay is result-unavailable, without a second effect. `tests/run-fence.test.ts` exercises same-run reopening, historical unknowns, corruption/orphans, scan bounds, and same-incarnation consumption. Those tests do not establish cross-run candidate/native/hook coverage, and were not run during this review.

### A committed receipt is not the whole safety decision

`ClientGatewayDurableDispatch` commits the validated receipt before invoking the registered completion observer. If that observer fails or cancellation/stop wins afterward, dispatch can report outcome-unknown while the durable gateway row remains committed. Required-run observation, engine handling, or consumption can also fail after receipt commit; `command-run/controller.ts` then latches private blocked state. Store consumption facts are not a durable execution seal.

Consequently, querying only `pending`/`unknown` gateway rows can falsely return clear after reopening. A receipt authenticates the remote command's reported terminal result; it does not by itself prove that required engine handling completed or that the engine did not classify a possibly lasting effect as uncertain. Preserve the distinction between remote receipt, semantic effect settlement, and required handling/consumption.

## Coverage counterexamples in the current graph

| Actual boundary | Observed gap | Required producer placement |
| --- | --- | --- |
| `runtime/native-execution/native-node-runtime.ts` | Calls `binding.implementation(...)` before returned effects are interpreted. Trusted code can act directly and then throw, return no effects, or ignore abort after the timeout race. | Persist invocation entry before the actual implementation call, retaining actual invocation/promise identity. Refusal before invocation remains honestly unacted; exception/timeout after entry is not unacted. |
| `runtime/output-dispatch/{io,runtime-effect}.ts`, `io/index.ts`, `runtime/service.ts` | The registered-output path can reach ordinary adapters/transports without a command context. Required-context paths correctly refuse missing required handlers. Custom callbacks can act and throw before a result exists. | Observe the actual transport/adapter invocation. Gateway sends reuse the existing claim owner. An outer output frame must not manufacture a second command receipt or double-count runtime-to-IO fallback. |
| `engine/automation/node-execution/attempt.ts` | Optional required scope covers selected dispatched output effects. Native and untrusted/custom execution are rejected in required mode but remain callable in ordinary mode. | Carry the orthogonal execution admission capability to native, custom/builtin invocation, and emitted-effect boundaries; keep existing trusted action-effect floors and required refusals. |
| `engine/automation/outside-graph/retries.ts` | Its caller-supplied dispatch can perform an act and reject before the result reader runs. No required-command/admission input covers this path today. | Begin before `dispatch`, record uncertainty independently of parsing, and propagate the same owning scope through retries/source reacquisition. |
| `engine/automation/{graph-run.ts,composite/run.ts,composite/execution.ts}` and Studio subflow trials | A child/partial run can fail uncertain while a caller starts another graph with a new run ID. A parent result is not exhaustive child coverage. | Forward the same private authority into nested/compiled/delegated execution; close parent coverage only after all actual child entries are accounted for. |
| `programs/automation-studio/runtime/service/candidate-trial/{run,port}.ts` and subflow `start.ts`/`run.ts` | `prepareStart`/reset work can happen before a trial session exists. Hook failure is converted to a start failure; result JSON cannot reveal whether the hook already acted. | A durable entry and live admission are required before an effect-capable start/reset callback, not only before graph execution. |
| Studio runtime `service.ts` build composition, `service/trial-ports/*`, `service/project-build/whole-trials.ts` | Exploration tools, whole trials and nested/partial trials are composed separately. Landed-act summaries are intentionally incomplete for failed/unknown acts. | Create/load one continuation authority at composition and pass the original capability through all real execution routes and wrappers. |
| Studio runtime `llm/evidence-loop.ts` stall recovery | Recovery calls `runCall` directly, outside normal call admission. | Both entrances use one private admission helper, without minting an extra counted candidate permit. |

The native boundary is not a sandbox. A trusted implementation that starts untracked fire-and-forget work has no generic proof of quiescence. Supported completion must be defined by the actual trusted producer and its effect contract; a parsed success, empty `effects`, boundary validation, abort signal, or timeout cannot independently establish that proof. Unsupported direct execution remains unverified rather than receiving a silent exemption.

Current `landed-acts.ts` deliberately selects successful, positively evidenced consequences. No landed entries is not proof that nothing acted. Trial verdicts, trace completeness, reset status, page state, and model assertions are also not replacements for execution coverage. Existing genuine unacted withdrawal before a claim remains useful; it must not be generalized to callbacks whose invocation may already have acted.

## Minimal durable extension, reusing command truth

Keep gateway claim/receipt/unknown rows and their validation as the only command truth. Reuse the project UnitOfWork and existing private completion/handling owners. Do not create a second engine ledger that copies gateway statuses and can disagree with them.

Three kinds of facts are missing and need persistence in the same project execution owner:

1. **Continuation/resource association.** Link all participating run/invocation IDs to the actual continued build/workflow and authoritative effect-resource scope. Load that association before any live callback. Candidate revision, run ID, evidence-loop restart, and trace-build UUID changes must not create fresh clear history. Resource/lease changes are interpreted by their owning authority; a new session label alone cannot erase uncertainty about an earlier lasting act.
2. **Coverage entries for execution outside gateway commands.** Persist entry before native/custom/hook invocation, plus containment links to child operations. Do not fabricate gateway client/session identities to store a native invocation as a gateway command. Parent coverage and a real child command are different facts, not duplicate receipts. A crash after entry but before proof leaves the entry unresolved.
3. **Terminal coverage/handling seal.** Persist whether an execution entry was completely and authentically accounted for, including all children and required handling. This is necessary for the committed-receipt/observer-failure case. A persisted open entry remains unverified after restart even if every currently visible command row says committed. Required historical-unknown or handling latches cannot be cleared by a less strict candidate-layer seal.

An aggregate admission query joins these facts to the existing command inventory and required owner. Missing association, uncovered legacy routes, migration gaps, corrupt/orphaned rows, failed reads, and inventory overflow produce `unverified`, never an empty clear result. Existing command scan bounds remain fail-closed. Old telemetry must not be backfilled into a false complete-coverage seal.

The minimal stored association is project + durable continuation + authoritative resource binding to actual run/entry IDs. A coverage row needs an entry ID, parent entry, owning producer, actual invocation/attempt provenance, open/terminal coverage state, and references to existing command IDs or authentic non-gateway completion facts. An admission generation changes with relevant association/coverage/unknown facts. Linking a real command to coverage must occur in the same authoritative claim transaction, or leave a preexisting open coverage entry that cannot be cleared on linkage failure. Unlinked or incompletely inventoried relevant commands are unverified; filtering them away is unsafe.

Studio runtime `service.ts` build `creation.run` is the common composition point for exploration and trial creation. Its trace build ID can be generated afresh, and the creation purse tracks spend rather than execution certainty. Neither currently supplies the required persisted continuation association. Reopening an incomplete draft needs an explicit association through the durable project owner. If it cannot be recovered, live admission is unverified while diagnosis remains available.

This extension need not resume a prior required-command run: its current refusal on reopening stays intact. The new authority needs to observe and fence across associated runs, not relax exact-once required-run continuation. A later remote reply/page check/reset does not automatically settle a terminally unknown or required-latched operation. Reconciliation, if supported, must be the existing authentic owner or a specifically defined trusted reconciler; otherwise the barrier remains.

## Narrow neutral ports and authority split

Suggested new neutral owner: `runtime/execution-admission/`, with project storage/composition implementations beside the existing Studio command owner. Engine integration consumes runtime ports; runtime must not import engine or Studio. The following are responsibilities rather than proposed model-visible schemas:

| Port | Consumer and contract |
| --- | --- |
| Informational safety query | Returns clear/pending/required-latched/unverified plus an observed generation and redacted diagnostics. It grants nothing and cannot be converted from JSON into live permission. |
| Private live-admission consumer | Obtains a durable scoped reservation against current coverage/resource generation. Rechecks atomically at the actual live entry and each committing invocation. Releasing/aborting a reservation does not clear pending entries. |
| Trusted execution producer | Persists begin before invoking its owned callback, returns an opaque operation ticket, and records authentic completion/uncertainty for that actual invocation and children. The caller/model cannot select a settled state. |
| Completion/coverage bridge | Delegates to the sole existing gateway outcome/required handling owner and seals coverage after that owner accepts the proof. Native/custom/hook producers use their supported actual completion contract; no generic result-object assertion is sufficient. |

A concrete storage adapter can expose `inspect(binding)`, `reserve(binding, expectedGeneration)`, `begin(reservation, actualProvenance)`, `associateCommand(entry, existingClaim)`, and `seal(entry, authenticWitness)`. Reserve/begin/seal handles belong to the configured private owner, not a public constructor or a caller-selected status. Gateway linkage delegates to the existing claim transaction. Closing a reservation never seals its entries; expiry or process death leaves open coverage unresolved. Seal occurs only after semantic assessment and any required consumption, not automatically on receipt arrival.

Private WeakMap membership should bind producer, consumer, continuation, resource, entry, generation and original object identities. A serialized receipt/query, copied/prototype-spoofed handle, tool name, reason text, candidate metadata, or `retryAllowed` boolean cannot mint any of these rights. An unadapted custom trial/legacy executor port has no live authority by default.

Gateway integration needs actual issuer/resolver wiring. `programs/_shared/runtime.ts` currently resolves contexts through the required command-execution owner or the older command-context owner. An ordinary observed gateway path needs an explicitly configured trusted owner/bridge accepted there. Merely invoking `ClientGatewayCommandContext.issue` does not enroll an arbitrary context in either registry. `outcome.ts` permits one observer; extend/delegate through its real owner rather than replacing it with a second observer.

Keep native grants, per-domain matcher binding, registered-output identity, confirmation order, and canonical effect floors unchanged. Carry observation/admission through explicit options/ports; do not proxy or clone the original host to intercept calls or change method receivers. Leave existing native host DTO isolation behavior intact.

A gate-level generation check alone has a race: another exploration call can become pending between the check, a start hook, and the eventual send. Durable reservation and entry creation must share the authoritative admission transaction/CAS boundary. Nested children share their real parent's reservation and identity; they cannot bypass a new unknown by issuing fresh scope IDs. A covered unresolved child prevents subsequent committing children.

## Candidate permit, read work, and cache race

Retain the proposed separate, one-use reentry permit in `runtime/agents/gates/reentry/`. Bind the exact loop/gate/candidate revision/digest/base/environment and completed counted ordinal. Consume synchronously before awaiting admission or hooks. No reset, refusal, unaffordability/refund, abort, or loop restart renews that consumed ordinal. Ordinary `llm/repeat-guard/retry-later.ts` behavior remains strict for potentially acted calls.

Fresh candidate revisions also require execution admission; the permit is only repeat-call admission, not settlement. The alternate stall entrance must run the same actual admission function and consume the same right when applicable. Existing maximum trial count, repeated-failure closure, reset admission, affordability, and promotion rules stay independent.

`candidate-trial/port.ts` currently checks retained unjudged state in `prepareStart`, then later removes it in `run` and selects rejudge versus live. A read-only classification can become stale. Check out and pin the exact retained result/evidence object and candidate identity before deciding no-dispatch mode. If it disappears or mismatches, refuse that call rather than falling back to live. Wrappers in trial environment/project whole-trials must privately forward the original mode/authority, not reconstruct it from environment-kind strings.

Pinned cached rejudgment and truly offline work can remain available while live execution is pending, provided their execution path cannot call a live graph or start/reset hook. Genuinely read-only diagnosis stays available through real read-only ports. Neither a read tool's name nor an offline flag authorizes arbitrary native/custom code to bypass the committing barrier. An offline/read result cannot promote itself to a live send.

## Closed implementation split

Fix these interfaces before dispatching the implementation lanes. The candidate-only permit must not become a production exemption while the other lanes are incomplete.

| Lane | Exact existing owners needing changes; proposed new owner | Acceptance boundary |
| --- | --- | --- |
| A: durable authority and command bridge | `programs/automation-studio/storage/project/command-ledger/{contracts,store,migration,admission}.ts`; Studio runtime `service/command-run/controller.ts` and `service/command-execution/{contracts,controller,lifecycle}.ts`; `client-gateway/service/command-ledger/{contracts,outcome,dispatch}.ts` only where needed for the sole-owner bridge; new `runtime/execution-admission/*` neutral ports and project-local admission/coverage storage leaves. | Restart-safe association, coverage/required latch, aggregate query and private reservation. Existing exact claim/receipt identity and required historical unknown semantics preserved. No duplicate command ledger. |
| B: invocation producers and propagation | `runtime/native-execution/{native-node-runtime,execution}.ts`; `runtime/output-dispatch/{io,runtime-effect,ports/io,ports/runtime}.ts` as necessary; actual `io/index.ts` and `runtime/service.ts` invocation leaves; `engine/automation/{node-execution/attempt,outside-graph/retries,graph-run,step-loop/uncertain-stop}.ts`, composite execution/run and option propagation. | Before-call persistence for every supported real entry, actual completion/uncertainty, shared scope across children, fallback counted once. No source-only result/landed observer substitute. |
| C: private candidate/loop protocol | Proposed `runtime/agents/gates/reentry/*`; Studio runtime `flow-bootstrap/candidate/{trial-gate,stall-retest}.ts`, `llm/{evidence-loop,decision-handlers/stall-recovery}.ts`, `service/candidate-trial/{port,run}.ts`, `service/subflow-trial/{start,run,port}.ts`, `service/trial-ports/{environment,whole-ports}.ts`, `service/project-build/whole-trials.ts`. | One-use permit, common stall admission, pinned no-dispatch checkout, wrappers retaining private identities, original positive/negative candidate oracles. |
| Lead integration, serial shared files | `programs/automation-studio/runtime/service.ts` common build/continuation binding; `programs/_shared/runtime.ts` configured context resolver; public barrels/exports/docs. Coordinate `runtime/service.ts` with B, not simultaneous edits. | The actual product composition routes exploration, hooks, partial/nested/whole trials through accepted A/B capabilities; no legacy auto-grant. |

The original candidate protocol's engine hook list is insufficient without B's native/IO/actual service and hook producer ownership. These are necessary scope expansions, not optional follow-up coverage. A can be split internally after the storage/neutral contracts are fixed; C can build against those stable ports while B instruments disjoint boundaries. Run one coordinated integrated acceptance only when all source owners freeze.

## Deterministic acceptance cases to add

These are required proposed tests, not checks run in this report. Place tests beside their actual owners and retain existing candidate assertions unchanged.

- A native implementation increments an isolated durable counter, then throws; another ignores abort and finishes after timeout. Repeating through normal candidate entry, stall entry, a new revision, new run ID, and reopened continuation performs zero second committing invocation. Unsupported settlement stays unverified.
- A real gateway claim sends once, loses its ACK, then reopens. Both exact replay and an associated fresh run remain fenced. Separately, commit a receipt and fail the completion observer or engine consumption; reopening must still refuse a second committing send.
- A committed failed receipt whose engine effect assessment is uncertain remains blocked. A required historical unknown later accompanied by a receipt or page `not_landed` evidence remains required-latched.
- A child/partial/outside-graph invocation acts and fails before its reader/parent returns; the parent cannot acquire another live child through a new run. A start/reset hook acts and throws before trial session creation; no second hook or graph entry is admitted.
- Exercise direct IO, RuntimeService adapter/transport, and runtime-to-IO fallback. Registration/confirmation behavior is unchanged; there is one real backend command claim and correctly linked outer coverage, not two independent sends/receipts.
- Insert pending work between gate query and hook/send admission. The transaction/CAS at actual entry refuses the second act. Crash after coverage entry but before claim also remains unverified on reopen.
- Evict/change retained cache after mode selection. Rejudgment refuses rather than running live; a pinned retained result can be judged while unrelated live uncertainty exists with zero Flow/start/reset invocations. Offline work cannot promote to live.
- Foreign/copy/prototype-spoofed permits, JSON `retryAllowed`, fabricated receipts, and unadapted custom ports grant nothing. Original private-field/WeakMap host receivers work unchanged.
- Corrupt/missing associations, incomplete historical coverage, failed reads, orphan rows, and scan overflow allow diagnosis but never clear live admission. A genuinely distinct resource is accepted only through its owning authority's proof.
- Preserve actual pre-claim withdrawal as unacted and ordinary automatic retry/source reacquisition behavior. Preserve the original three candidate positive cases using real test-controlled observed/no-dispatch producers, plus maximum-count, same-failure closure, reset refusal and affordability semantics. Test refusal paths consume no fresh candidate right and cannot mint another ordinal.

## Handoff

The review is complete and all source remains frozen. The candidate protocol can be implemented against the refined split, but existing sources do not yet supply the durable complete-coverage authority required for its positive live exception. Minimal reuse is the authenticated command journal and actual private command/engine owners, augmented with durable association and execution coverage rather than a second command truth.

Not verified: a concrete new persistence migration or API, all custom downstream adapters' completion guarantees, execution after process restart for the proposed scope, and any tests/builds/typechecks. Those are implementation acceptance work, not evidence claimed here.
