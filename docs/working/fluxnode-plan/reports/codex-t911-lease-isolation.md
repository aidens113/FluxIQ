# t911 runtime lease isolation: interface endpoint

## Status

The lead approved the revised authority, adapter, terminal-known-unsent, run-owner, ordinary final-admission, and Core runtime-transport scopes. Implementation is in progress. The initial two causal regressions reproduced the leak against unchanged production and now pass through the real runtime/gateway wiring. No final acceptance is claimed yet.

## Implementation checkpoint and observed validation

- Authority foundation: `lease-authority.test.ts` + `host-lease/tests/stamp.test.ts` -> 14/14 passed, 1.84s. Lead independently reran the frozen subset -> 14/14 passed, 1.29s. This accepts only the foundation.
- First affected package check: heavy-slot `pnpm --filter fluxiq check` -> exit 1 after 80.003s, six TypeScript null-narrowing diagnostics in the new final-admission helper. Corrected with an explicit return on absent ready session; subsequent package check remains pending.
- First integrated narrow run: heavy-slot `pnpm --filter fluxiq exec vitest run src/programs/_shared/tests/runtime-host-lease.test.ts src/client-gateway/service/command-ledger/tests src/runtime/project-agents/host-resources/tests/lease-authority.test.ts src/client-gateway/service/host-lease/tests/stamp.test.ts --maxWorkers 2 --minWorkers 1` -> 67 passed / 2 failed, 8 files, 73.30s. Both original real-runtime ownership regressions passed. All eight new durable resolver/claim/trace/timer/Stop/disconnect/metadata/immediate-reply cases passed.
- The two failures were the old no-socket assertion (`outcome_unknown` rather than known unsent) and an immediate-close test that had not actually entered its delayed claim before close. Updated the first to assert `socket_unavailable` before any claim; added an explicit claim-entered signal to the second, retaining zero-send, close-draining, and lease cleanup assertions while expecting cancellation-before-send. These revisions await rerun.
- New real-SQL terminal/refusal/reopen/corruption/failure tests, a real owned-command-run retry test, a real executor/private-provenance/SQLite retry test, and ordinary trace/timer admission tests are authored. Their focused four-file job is queued/running through heavy-slot; source remains frozen while it may read.

The implemented storage port accepts the original private **live proof**, not a refusal string: `refuseUnsent(claim, proof)`. A failed refusal write leaves pending history unresolved; the original proof is retained in the thrown settlement error. Reopening a real committed refusal is supported. A pending claim or newly missing lease never recreates certainty after restart.

The transport prepares trace/timer callbacks while no socket invocation has happened, then re-resolves session/trusted-domain/lease before appending an executable outbound entry. Failure leaves neither queue nor socket effects. Only actual socket invocation crosses into uncertain-send handling. Immediate synchronous answers retain their pending entry and answer timer. Ordinary queue/no-socket compatibility remains intentional for explicitly context-free calls.

### Expanded durable-union consumer audit

- `client-gateway/service/command-ledger/controller.ts`: explicit terminal refusal reconciliation; no receipt or unknown record is fabricated.
- `.../dispatch.ts`: explicit `refused_unsent` return before its non-completed observer/uncertainty branch; initial/preclaim refusal informs the exact owner through a private unsent proof. A settlement failure keeps that live proof and blocks continuation.
- `client-gateway/service/commands.ts`: normal fulfilled refusal results already close diagnostic command history as settled; the rejection path for a refusal-persistence failure is still being reviewed so diagnostic history does not imply that a socket invocation happened.
- `runtime/recording/client-gateway/bridge.ts:210`: passes non-completed outcomes through without capture, completion consumption, or `Stop`. No production edit required.
- `runtime/client-gateway-transport.ts:66`: newly approved owner path. Now handles `refused_unsent` before `Outcome.stop`, returning cancelled for an aborted caller and otherwise a failed, retryable, unacted result using the existing typed failure shape.
- `framework/automation-service/service/command-run/controller.ts`: verified terminal refusal withdraws only its exact registered effect; `withdraw` is idempotently true for legitimate withdrawn effects. Same-id replay remains no-send; a fresh attempt may proceed. Pending/unknown/receipted-unconsumed predecessors still block.
- `engine/automation/node-execution/attempt.ts:355-399`: inspected only. Its existing non-receipted + successful withdrawal path calls `notSentResult`, skips `consume`, and uses `{ category: "action_failed", code: "executor.required_command_not_sent", retryable: true, stage: "dispatch", effect: "unacted" }` when no dispatcher failure was supplied. New real executor test must prove that path; no engine source edit is proposed.
- Other similarly named candidate-verification/accepted-state/authority-guard outcomes are separate result unions, not gateway durable-result consumers. The scoped production search found no further gateway-union mappers.

The exact added approved Core mapper/test paths are `runtime/client-gateway-transport.ts`, `runtime/tests/client-gateway-transport.test.ts`, and `service/command-execution/tests/{required-transport.test.ts,controller.test.ts}`. Added approved ordinary helper/test paths are `client-gateway/service/host-lease/admission-refusal.ts` and adjacent `service/tests/commands-host-lease-admission.test.ts`.

Downstream migration is held for the lead's paired t912 checkout. Its current dispatcher also maps every non-completed result through `Stop`; the lead has been given the same existing retryable/unacted failure contract and must branch before `Stop`. A terminal refusal settles a single command attempt, never a new final task-failure path. Caller Stop still stops through its existing signal.

## Revised checkpoint: causal red, compatibility, and known-unsent settlement

### Observed causal red

Added `programs/_shared/tests/runtime-host-lease-fixture.ts` and `runtime-host-lease.test.ts`. The fixture builds two real `createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false })` instances, independently pairs clients to the same trusted domain, and registers distinct host-resource ports. No disk project or real browser/model state is used.

Validation: `node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t911-lease -- "pnpm --filter fluxiq exec vitest run src/programs/_shared/tests/runtime-host-lease.test.ts"` -> exit 1; 1 file / 2 tests failed, duration 64.44s, test bodies 95ms.

- Strictness: A's own unleased command correctly refused `host_lease.missing`; B's independent same-domain command then incorrectly answered `failed` instead of `succeeded`.
- Ambient stamp: B's command succeeded but its actual socket payload incorrectly carried A's `{ resourceKey: "resource.ambient.a", epoch: 1, holder: { role: "builder", briefId: "brief.ambient.a" } }` lease.

This is an actual reproduced gateway ownership failure, beyond the earlier source-only finding. Scopes are acquired through today's port-only factory because production has no owner argument yet; the green migration will supply the actual owning runtime binding to that same factory.

### Legacy source and scope compatibility (approved by lead)

Preserve `ClientGatewayHostLeaseSource` exactly as the existing untagged contract: `current()`, `isCurrent(lease)`, `requiresLease(sessionId: string)`. Add a separate `ClientGatewayHostLeaseTargetSource` with `kind: "owner-domain.v1"` and the explicit target-taking methods. Core's authority creates only the discriminated source. Gateway options/stamp accept the union; a narrowly cohesive adapter invokes legacy `requiresLease(target.sessionId)`, never the target object. Unknown explicit discriminator values are rejected. Tests must include a legacy implementation that compares the received value to an actual session-id string, so an accidental object argument fails causally.

Keep the public `AutomationStudioHostLeaseScope(scheduler, { strict? })` constructor available for explicitly legacy/manual integrations and existing tests; add optional `binding` in its options. Legacy scopes and their static source remain a separate legacy authority namespace. They must never stamp or impose strictness on a Core owner-bound source. Every production Core acquisition in this unit uses an explicit binding. Preserve static `current()` as a contextual/diagnostic compatibility reader while migrating every production authority consumer; the new bound reader is the authority API. This revises the earlier mandatory-constructor proposal below.

Additional approved/new adapter path: `client-gateway/service/host-lease/target-source.ts` and `.../adapter.ts`, with owning barrel/type union updates. No public source callback silently changes signature.

### Downstream and simulation consumers actually traced

- Downstream production `domain/src/runtime/web-sessions/leased-web-session.ts` uses both static `current()` and static `gatewaySource.isCurrent()` to select/validate the browser. This is an authority consumer and must migrate, not merely compile unchanged.
- That reader is used by `web-sessions/pick-web-session.ts` and directly by `runtime/llm-evidence/tools.ts:584`. `pickWebAutomationSession` is called by `io/gateway-output-dispatcher.ts:216`, `runtime/adapter.ts:180`, and `runtime/host-resources/leasable-session.ts:12` (called by `host-resources/port.ts`). Each actual caller already has FluxIQ or is constructed from its gateway; thread the owner/domain binding at that construction boundary. Do not infer owner from a sessions array. Exact downstream edits require the lead's paired-lane ownership approval.
- Downstream `web-sessions/tests/pick-web-session.test.ts` constructs two public legacy scopes. Preserve these as explicit legacy API tests and add instance-bound selection tests when the product callers migrate.
- Downstream `packages/test-runner/src/fluxnode-host-proof/proof-host-module.ts:17` reads `current()?.holder.briefId` only for its scripted proof model; diagnostic compatibility can preserve that reader without granting authority.
- Scoped `rg` searches in `!FluxIQTestEnvironments/packages` found no direct lease scope, source, factory, or `hostLease:` consumers. `packages/fluxiq-binding/src/register/register.ts` exists, but no direct lease construction/reader was found under that binding. This is a search result, not a live simulation compatibility pass.

### Known-unsent durable settlement: exact proposal still held for review

The existing `AutomationStudioCommandRunController.withdraw(context)` explicitly returns false once `effect.claim` exists. `ClientGatewayCommandLedgerController.dispatch` catches any send-callback rejection and writes `send_uncertain`. Neither is an adequate post-claim lease-refusal seam.

Propose an append-only terminal server admission outcome, distinct from a client receipt and from uncertainty:

1. `ClientGatewayCommandRecord` gains state `refused_unsent` with an optional-at-the-object-level `refusal` field required only in that state. The refusal is a bounded server record `{ code, refusedAt }` bound to the exact immutable claim/request digest by its stored proof. In this state `receipt`, `committedAt`, and `unknownReason` remain null. Old pending/unknown/committed record shapes remain valid without a new field. `ClientGatewayDurableDispatchResult` gains `{ status: "refused_unsent", refusal }`; it never carries a fabricated client receipt/result.
2. Add optional trusted port capability `refuseUnsent(claim, code): Promise<ClientGatewayCommandRecord>`. Core's store and run wrapper implement it. A durable dispatch with lease authority requires this capability after resolving the ledger and BEFORE `claim`; an older adapter lacking it is rejected as `durable_command.unsent_settlement_unsupported` without a claim or send. This is an intentional, documented migration for custom durable storage adapters; it does not silently downgrade safety.
3. Add private, branded/registered `ClientGatewayCommandUnsentRefusal` under `client-gateway/service/command-ledger/unsent-refusal.ts`. Only the gateway's final pretransport admission path creates it, before enqueue/socket invocation. Plain errors or matching strings from clients/custom callbacks cannot classify work as unsent. All post-invocation send errors retain uncertainty.
4. Extend `ClientGatewayTransport.sendChecked` with a synchronous admission callback run after `requireReady` and socket/client ownership validation and before trace/outbound/socket invocation. The callback re-resolves the ready session's current trusted-client domain and channel scope, validates client/project binding and owner/domain/epoch/holder against the ORIGINAL stamped claim, and refuses if the freshly stamped command differs. It never silently restamps the immutable claimed request. There is no await from final checks to invoking the socket. A disconnected/unready/socket-less target is also a known-unsent pretransport admission refusal, not an uncertain send.
5. Durable dispatch forwards this branded refusal to its answer pipeline WITHOUT calling `uncertain`. Controller catches that exact private refusal, calls `refuseUnsent`, validates/read-verifies the terminal record, and returns `refused_unsent`. It invokes neither `commitReceipt` nor `markUnknown`. Other errors continue through the existing uncertainty path. Gateway's observer branch must recognize `refused_unsent` before its generic non-completed/uncertain branch; it must never call `observer.uncertain` for this case.
6. The store adds a separate `gateway_command_unsent_refusals` table via a new migration after `0027` (do not edit the historical migration). Exact-claim pending -> terminal refusal is atomic/idempotent in `runIdempotent`, with operation `unsent_refusal` and proof over `{ claim, code, refusedAt }`. Refuse any attempt to overwrite a receipt/unknown/previous different refusal. The original claim and its mutation stay retained. Replaying the SAME command id returns `sendAllowed: false` plus the same terminal refusal, so settlement cannot reopen or resend it. Reads/scans verify the refusal row/mutation join, reject orphan/conflicting histories, and include the new operation in their existing inventory checks.
7. The exact-context ledger wrapper in `service/command-run/controller.ts:resolve` implements `refuseUnsent`. After the store commits and read-verifies the matching terminal refusal, mark ONLY that registered effect withdrawn. No receipt ticket is issued and completion consumption is not faked. Its store's `claimForRun` admits a fresh attempt past a preceding verified `refused_unsent` record; it continues to require privately consumed receipts for preceding actual sends and to block unknown/pending/conflicting records. This clears known-unsent work without permitting replay of its old context/id. If the run incarnation/fingerprint has changed, record the unsent outcome but do not grant the changed owner continuation.
8. Before any claim: revalidate after async `resolve` as well. Initial `execute` rejection remains synchronous and touches no ledger resolver/mutator. After resolver but before claim, refusal touches no ledger mutator; the existing preclaim owner withdrawal applies. Post-claim refusal uses the terminal seam above. A refusal-persistence failure is reported as a storage/settlement failure while transport remains known-unsent, with no `send_uncertain` write; fail closed on continuation. Recovery must re-read/idempotently finish the refusal before granting a new attempt.

Requested exact additional production paths, still unapproved: `client-gateway/service/{transport.ts,command-ledger/contracts.ts,command-ledger/controller.ts,command-ledger/unsent-refusal.ts,command-ledger/index.ts}`; `framework/persistence/automation/project/command-ledger/{store.ts,contracts.ts,unsent-migration.ts,index.ts}`; `framework/automation-service/service/command-run/controller.ts`; adjacent tests and memory-ledger fixtures implementing the new optional capability. The existing durable dispatch/commands paths remain as previously listed. No result-owner or input-owner changes are proposed.

Focused causal gates: resolve paused -> release/reissue then resume (no claim); claim paused after durable write -> release/reissue then resume (terminal refused_unsent, no transport, no receipt/unknown, same-id replay unsent); disconnect or trust-binding change during paused claim (same terminal behavior); normal transport rejection AFTER socket invocation (still unknown); terminal persistence retry/reopen and corrupt/conflicting joins (fail closed); active command-run fresh attempt after verified terminal refusal (allowed), old effect/context replay (never sends), pending/unknown/actual-sent-unconsumed predecessors (still blocked); legacy storage without settlement support (refuse before claim); actual owned-source initial refusal (resolver and every mutator untouched).

Open review point isolated to settlement: approve the terminal `refused_unsent` contract/storage/run-wrapper expansion before its implementation. The authority and explicit legacy adapter pieces can be implemented and tested independently. No final durable wiring may ship until this seam prevents both stale sends and false uncertainty.

## Stable interface proposed for approval

1. Add `runtime/project-agents/host-resources/authority.ts`: `AutomationStudioHostLeaseAuthority.for(instance: object)` returns one authority per actual Automation Studio instance, held in a `WeakMap`. Each authority privately creates an opaque object capability. No string id, session metadata, resource key, port identity, or wire field identifies the owner. `forDomain(domainId: string | null)` returns a cached, immutable `AutomationStudioHostLeaseBinding`; `null` means an explicitly bound global/no-domain runtime, while `undefined` means no binding and must never be substituted for `null`.
2. Add `.../host-resources/binding.ts`: internal `AutomationStudioHostLeaseBinding`, carrying the opaque owner capability and the bound runtime domain. It provides the owner/domain-aware `current()`, `isCurrent(lease)`, and `requiresLease(sessionId)` view for runtime consumers. The owner capability is never included in a resource lease or command payload.
3. Change `AutomationStudioHostLeaseScope` construction to require a binding beside its scheduler. Frames and strict entries carry that binding. A stale frame remains visible to its matching binding so `isCurrent` refuses it; it must not disappear and become an unleased command. Keep the static unqualified current reader only as a diagnostic if compatibility requires it; no production permission, admission, reset, or gateway decision may use it.
4. `AutomationStudioHostLeaseAuthority.gatewaySource` is a per-instance `ClientGatewayHostLeaseSource`. Change all three source methods to accept a `ClientGatewayHostLeaseTarget`: `current(target)`, `isCurrent(lease, target)`, `requiresLease(target)`. Add the target type under `client-gateway/service/host-lease/target.ts`, containing `sessionId`, `domainId: string | null | undefined`, and the server-owned `channelScope` when applicable. The owner is fixed by the source closure; a caller never supplies it. `clientGatewayHostLeaseStamp(command, source, target)` replaces the session-id-only argument.
5. The gateway creates the target only after `sessions.requireReady`. It resolves `domainId` by `session.trustedClientId -> trustedClients.get(id)`, requiring an active trusted record and a defined binding. It never reads `metadata.domainId` for authority. An explicitly trusted `null` domain remains distinct from an absent record or an undefined historical binding.
6. `automationStudioProjectHostLeaseScope(port, binding)` caches scope associations by port + owner + domain, but a separate `WeakMap<port, scheduler>` continues to own exactly one capacity scheduler per physical port. Different bindings over the same port cannot ask it for independent capacity.

### Exact decision behavior

| Target and ambient state | Ordinary/durable result before send or ledger resolution |
| --- | --- |
| No applicable ambient lease and no strict lease for target owner/domain/session | Original command, with no lease field added. |
| Owner A frame ambient, command through owner B | A contributes neither stamping nor strictness. B's own strict entries alone decide whether B needs a lease. |
| Same owner, domain A frame ambient, target domain B has no strict lease | Original command, no A lease. |
| Same owner, domain A frame ambient, target domain B has a strict lease | Refuse `host_lease.missing`; A cannot satisfy B's lease. |
| Matching owner/domain/current lease, and its explicit session if one is named | Stamp only the existing wire lease fields. |
| Matching owner/domain frame after release or resource reissue | Refuse `host_lease.stale`; resource epoch and holder checks remain unchanged. |
| Explicit caller-supplied lease without an applicable matching ambient lease | Refuse `host_lease.holder_mismatch`, including claims copied from another owner/domain. |
| Explicit-session strict lease for session A | Only A is strict inside its owning authority/domain; B stays independent unless B has its own strict entry. A's grant cannot stamp B's command. |
| Ready live target without a server-bound domain | Never stamp. Explicit claims refuse mismatch. An own-owner ambient frame or a current strict entry whose domain cannot be excluded requires a lease and refuses missing; it cannot grant admission or turn stale work into an unleased act. Without such authority in force, preserve the unleased legacy command path. |
| Server-attached scoped/offline session | After existing channel-scope admission succeeds, do not borrow any live lease or live strictness. It has no trusted-client record, so no hello metadata becomes authority. An explicit lease claim still refuses. This preserves the scoped replay channel without treating it as a trusted live host. |

The unknown-domain rule is intentionally conservative inside the owning instance; it never restricts another instance because the source is already owner-bound. An offline/scoped target is explicitly distinguishable by its existing server-set `InternalSession.channelScope`, not by metadata. No protocol or pairing changes are proposed.

## Exact wiring and requested final production paths

All paths below are under `packages/fluxiq/src/`.

### Authority, scheduler, and gateway (initial ownership plus narrow additions)

- `runtime/project-agents/host-resources/{authority.ts,binding.ts,lease-scope.ts,index.ts}`: create private instance authority; domain views; bound scope frames and strict entries.
- `runtime/project-agents/dispatch/{host-lease.ts,types.ts,dispatcher.ts}`: shared scheduler and bound scopes; dispatcher receives an explicit binding.
- `client-gateway/service/host-lease/{target.ts,source.ts,stamp.ts,index.ts}`: owner-bound source target contract and unchanged wire whitelist/refusal policy.
- `client-gateway/service.ts`: inject one trusted target resolver into `ClientGatewayCommands` (and its durable collaborator), reading that gateway's private session/trust registries only.
- `client-gateway/service/{commands.ts,command-ledger/dispatch.ts}`: ready session and trusted target before stamp; durable stamp before digest, storage resolver, claim, pending entry, or send. Recheck current lease at the actual durable dispatch boundary if the async ledger resolver/claim can outlive its scope; initial refusal must still leave the ledger untouched.
- `programs/_shared/runtime.ts`: replace the shared static source with `AutomationStudioHostLeaseAuthority.for(automationStudio).gatewaySource`. Each actual `createGlobalProgramRuntime()` therefore owns its own source.

### Existing service consumers (no phase-4 runtime selection)

- `framework/automation-service/service.ts`: only the authority/domain injection expressions at trial collaborators (currently line 387), project-build ports (1574), and runtime admission/page-held composition (2466), plus the necessary imports. Existing service selection stays unchanged. Domain comes from the service's already-bound `ioRuntime`/`llmEvidenceRuntime`; absence stays absent. A future selected bundle hands its actual `domainId` to the same seam.
- `.../service/trial-ports/{collaborators.ts,environment.ts}`: carry the actual instance authority with the existing collaborators. Trial environment binds it to its evidence runtime's domain. `whole-ports.ts` already spreads that environment and needs no behavioral change.
- `.../service/project-build/{types.ts,run.ts}`: require/pass the bound authority beside `host`; the subflow scheduler and dispatcher both use it.
- `.../service/project-build/subflow-trials.ts`: replace its ambient `current()` used in trial context with the passed binding's reader; retain its scheduler semantics.
- `.../service/project-build/whole-trials.ts`: its trial-environment type must carry the binding so `trial-ports/environment.ts` can pass it through to candidate-trial ports.
- `.../service/project-parts/run/{types.ts,run-part.ts,driving-gate.ts}`: include authority in the collaborators picked by part runs; derive the binding from that instance's already-bound executor IO domain; only a current matching binding bypasses the lease acquisition/gate.
- `.../service/runtime-session/{page-held.ts,admission.ts}`: use an explicit binding for all current/is-current/strict checks; a foreign or stale frame never bypasses another runtime's session/page checks. Capacity remains the shared port scheduler's real capacity.
- `.../service/candidate-trial/{contracts.ts,run.ts}`: carry binding and read its own current lease before calling a live reset hook. Matching stale leases still refuse; unrelated owner/domain lease is never passed to another trial's hook. No binding plus an ambient owner lease cannot confer reset authority.

### Managed FluxNode host path, also required

- `.../service/fluxnode/hosts/host-pool.ts`: constructor requires the same instance authority plus its already-explicit domain; uses its own bound scope and scoped nested-lease check, without static ambient authority.
- `server/cli/run-dev.ts:60`: sole production constructor caller. Pass `AutomationStudioHostLeaseAuthority.for(fluxiq.programs.automationStudio)` to the pool, alongside the existing gateway/domain/capacity. No `framework/index.ts` edit needed.

The remaining potential compatibility edits are the adjacent named tests/fixtures that directly construct scopes or custom sources. No broad public barrel, result, Answer First, input-owner, registry, or version edits are proposed.

## Causal regression design and focused gates

1. Add `programs/_shared/tests/runtime-host-lease.test.ts` plus a narrow fixture helper there. Create two real model-disabled program runtimes, independently pair ready clients to the same trusted domain, attach distinct ports, and acquire A's bound strict session-less grant. Outside A's frame: A refuses missing and B sends unchanged. Inside A's frame: A stamps its grant and B sends unchanged. Supplying A's lease to B refuses mismatch. Release restores unleased A/B. Test cleanup closes gateway, studio, secrets, and detaches runtime subscriptions.
2. Same real runtime/gateway with paired A/B domains and separate ports: A strict affects A only; A's ambient frame never stamps B. Hold B's own strict grant concurrently to prove B then refuses missing rather than accepting A. Explicit-session A/A2 preservation, wire whitelist, stale continuation, and same-key reissue remain direct scope tests.
3. Trusted-domain causal test: pair with a metadata object for A, mutate that original declaration to B after trust, and verify A remains the target authority. An unbound server-attached scoped session cannot gain live A authority by metadata; its valid scoped channel remains executable without a live lease. Also exercise undefined/missing trusted bindings without treating them as explicit null.
4. Durable groups: use actual bound source and trusted gateway clients, instrument `resolveCommandLedger` and all memory-ledger mutators, and prove mismatch/missing/stale refuse synchronously with resolver/claim/commit/markUnknown untouched and no action sent. Success digest includes only the wire lease. Hold/release/reissue while resolver/claim is awaiting to prove no stale send crosses the final boundary; report explicitly whether an admission recheck after a successful claim leaves a pending ledger entry, rather than claiming that already-claimed work was never claimed.
5. `runtime/project-agents/host-resources/tests/lease-scope.test.ts`, `client-gateway/service/host-lease/tests/stamp.test.ts`, `client-gateway/service/tests/commands-host-lease.test.ts`, and `client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts`: migrate source signatures and retain all existing supported refusal cases.
6. Add shared-port association regression beside `dispatch/host-lease.ts`: two owner/domain bindings over the same port still serialize at capacity 1; distinct ports progress independently. Cached scope/source identities cannot accidentally share authority.
7. Adjacent runtime-session admission/page-held and candidate-trial start tests: foreign owner/domain and matching stale frames cannot bypass held-page/adaptive gates or pass a foreign reset lease. Own current explicit-session lease retains immediate admission; no ambient lease retains existing behavior.
8. Managed gates: `service/fluxnode/hosts/tests/{host-pool.test.ts,managed-host-port.test.ts}` plus the actual managed launch/shutdown owner tests found by a filename search before execution. Extend pool tests with two actual runtime gateways, lease stamping/refusal, foreign pool nesting independence, queued cancellation, throwing work, nested own-owner refusal, close draining/release, and post-close refusal. Preserve shutdown order in `run-dev.ts`; existing managed/server shutdown tests are the narrow regression gates, not a real service launch.

After implementation approval, run named adjacent Vitest paths only through `node C:/Users/osrs_/FluxStuff/fxwork/.tools/heavy-slot.mjs run t911-lease -- "pnpm --filter fluxiq exec vitest run <exact paths>"`, then the affected fluxiq package check and structure audit through the same coordinator, one lane job at a time. No whole suite, browser/service launch, paid call, or generated dist mutation is needed for this unit.

## Endpoint return

Outcome: Partial
Changed: `docs/working/fluxnode-plan/reports/codex-t911-lease-isolation.md` only
Validation: Scoped source/call-site inspection only; no tests or builds run while production interface is held for lead review.
Not verified: No causal red/green yet; no implementation; no live/browser behavior. The ambient leak is source-proven, not claimed as a reproduced product user flow.
Report: `docs/working/fluxnode-plan/reports/codex-t911-lease-isolation.md`
Notes: Ready for the lead's interface review. Scope sharing must never duplicate the per-port scheduler. Managed host-pool binding and offline scoped-channel compatibility are part of the same ownership boundary.
