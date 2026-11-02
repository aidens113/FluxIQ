# Conversation parking completion cut

Dispatch: [parking-completion-discovery](../briefs/parking-completion-discovery.md). Status: **REPORT FROZEN; READ-ONLY**. No source, tests, configuration, baselines, shared documents or runtime data changed. No checks or processes launched.

## Recommended boundary

Implement the actual conversation parking producer in canonical `runtime/parking/conversation/**` and its activity decorator in canonical `runtime/activity/ask/**`. The existing Studio paths become exact compatibility exports. Constructors register only their own original callback identities and forward every supplied method through the existing canonical authoring invocation context. They do not certify a structural host, a fulfilled Promise or an ask/status DTO.

Completion comes from the actual conversation persistence owner, consumed-answer trace owner and activity-delivery owner. Reuse `OriginalExecutionPromiseReceipts`; do not create a second receipt protocol, scope registry or current-invocation slot. A positive fixture alone does not close the production path: the trace recorder and activity sender have real acknowledgment gaps described below.

The data/writer/store ownership prerequisites must also become canonical framework capabilities. Leaving a newly moved parking factory dependent on Studio conversation types, or treating the existing Studio SQL implementation as a permanent composition exception, does not satisfy the user's UI-only Studio requirement. These prerequisites can be separate disjoint releases, but are required for a closed production claim.

## Actual call and acknowledgment chain

| Original operation | Actual calls, in order | Existing acknowledgment and limitation |
| --- | --- | --- |
| Conversation `open(ask)` | Lazy `host.writerFor({projectId,subject})`; original writer `ask({text,ask})`; writer's lazy `openConversation`; `appendAutomationTurn`; project store `appendTurn` | `openConversation` and `appendTurn` await `unit.runIdempotent`, including the database transaction. `withStore` also awaits store close/lease release before resolving. This is an actual owning write boundary for the original built-in store, not a contract that can be inferred for a supplied host. |
| Conversation `awaitAnswer(ask,wait)` | Register settlement listener **before** reading; original `getAsk`; read the stored answer/status; original `expireAsk` only at the deadline; original listener stop in `finally`; repeat after timer/notification | `getAsk` awaits its store/lease cleanup. `expireAsk` uses the existing idempotent mutation and pending-row condition; an answer that won the transaction is returned instead of being replaced with expiry. `settling` wakes local listeners after the store operation resolves. Supplied listeners and stop functions are callbacks, not evidence of purity. |
| Consumed answer | After successful wait only, `recordConsumedAnswer` calls installed episodes' `recordControl({type:'ask_answer',...})` | The control record is currently **synchronous enqueue**, not durable acknowledgment. Failure of the wait records no answer. Tracing off/outside an episode records nothing. |
| Activity `open` | Current decorator looks up `port.open` at invocation and forwards it | No original-method pinning, observation or completion receipt. |
| Activity `awaitAnswer` | Pin a bound inner wait at construction; emit waiting; await inner wait; emit resolution, or cancelled before rethrow | Waiting is emitted only when work actually waits. Answer wins over simultaneous cancellation. The emitter/hub intentionally isolate presentation failures, but their return does not acknowledge subscriber work. |

Persistence facts to preserve exactly:

- The writer caches the original opening Promise and forgets a rejected opening so an unavailable database does not permanently silence that writer.
- Conversation identity reuses the explicitly named conversation, the same-project conversation context where valid, then the subject's open thread. Preserve that resolution order and all subject/thread/ask IDs; do not create an observation-specific thread.
- `appendAutomationTurn` currently mints its turn/mutation IDs once per call. `appendTurn` inserts the turn and ask in one transaction, records the turn's change before the thread's change, then increments revision/pending count. A retry after an uncertain result cannot simply call it again with a new turn ID.
- `getAsk` is project-scoped. The current ask-ID-only local listener is a wake hint, never authorization or an answer. A spurious wake from another project must still reread the original project.
- Cancelling the in-place wait does not expire the persistent question. A missing ask/store failure fails the wait instead of polling forever. A restart preserves the question but does not reconstruct the lost live run's values.
- The existing API authorization, answer-once/choice/permission checks and parked-run route selection remain the sole authorities. No completion declaration grants an answer, permission or resume authority.

## Existing stable ports to consume unchanged

1. `runtime/flow-authoring/execution/observation/index.ts` is the sole authoring invocation authority. Consume `AuthoringExecutionContext`, `AuthoringExecutionScope` (`of`, `own`, guarded `close`), and the typed invocation helpers. Its original seven context fields are `parent`, `callbacks`, `automation`, `originalRoot`, `toolObserver`, `toolRequest`, `prepareToolParent`. Forward the exact original context/options; do not reconstruct a root from a row/ID or copy its private maps. C confirmed these APIs and their old Studio aliases are stable.
2. `runtime/execution-observation/contracts/index.ts`: use the original `ExecutionCallbackCall<TReceiver,TArguments,TResult>` and managed registration relation. Pin receiver, function, tuple, binding and completion consumer before awaiting. Observation prepares a real child before invoking that exact method, and retains its original return and thrown/rejected outcome.
3. `runtime/execution-observation/queue-completion/index.ts`: reuse `OriginalExecutionPromiseReceipts.issue(originalPromise, source, enteredParent, completion)` and its original pinned `consume` method. The owning method returns that SAME Promise, issues only after its actual acknowledged work and cleanup, and consumes it once. The canonical consumer validates the original Source invocation/parent/reservation and settled child frontier. It refuses missing/copied/wrong-parent/aborted/unknown-descendant receipts and rejects reissuance. Rejection remains pending; a status object earns nothing.
4. `runtime/execution-observation/policies/index.ts`: original Core constructors may register their own exact methods as owning frames and their explicit managed completion policy. Registering a frame does not certify supplied IO. Do not declare mutating `open`, `expireAsk`, arbitrary listeners or activity delivery as `no_direct_effects`.
5. `runtime/parking/index.ts` already owns `AutomationStudioParkingPort` and answer/settlement contracts; `runtime/interaction/index.ts` already owns the complete ask/answer/permission payload. Preserve these contracts and optional `awaitAnswer` absence. No handles or new observation fields belong on asks, waits, answers or host data.

Use per-actual-call companions under the original entered frame. Bind only original Core-created invocation/port owners; do not temporarily bind a shared arbitrary host receiver across projects. For host calls that do not need nested Core orchestration, invoke the captured exact original receiver/method under the prepared Source child without granting that host a Core scope. Actual supplied callbacks remain unsupported unless their original owner has a configured contract. Existing unobserved calls retain their original behavior.

## Mandatory acknowledgment prerequisites

### Conversation persistence

The SQL truth already exists; move it, do not duplicate it. The narrow data-service slice is `openConversation`, `appendAutomationTurn`, `getAsk`, `expireAsk`, `writerFor`, `parkingPort`, `withStore`, plus the owned settlement notification machinery in `conversations/conversations.ts`. Its current class also owns unrelated model interpretation/commands/attachment resolution; do not move that whole mixed class as a shortcut.

Canonical conversation contracts/writer belong under `runtime/interaction/conversation/**`; canonical conversation row persistence belongs under `storage/project/conversations/**`. The existing thread/turn/rows/inputs/writer implementations and validations are the source authorities. Old imports become aliases/reexports, not parallel models. Retarget their action-permission imports to the existing neutral `runtime/action-permissions` owner; preserve the full permission request and parse checks.

The concrete store still imports `AutomationStudioProjectUnitOfWork`, database pool/lease/executor, schema runner and `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS` from Studio storage. There is no second canonical implementation of those actual classes on disk. A preceding SQL-foundation release must extract their real ownership to canonical `storage/project/{sql,mutations,migrations}/**`, with exact old aliases. Its concrete blockers are the database's `programs/_shared/performance-metrics` import and the unit's default whole Studio administration migration bundle; split neutral ports/migration inputs rather than importing the program back into canonical storage. Conversation migrations remain the same tables/IDs and project files. This report does not authorize that wider extraction.

At the resulting actual store owner, issue the original Promise receipt only after successful transaction acknowledgment **and** required store/lease cleanup. Observe original supplied SQL/notification collaborators, or leave their frontier unverified. A post-commit throw/lost acknowledgment does not issue a receipt even if a later read finds the ask. Preserve the original error and aggregate cleanup failures without replacing the primary cause.

### Consumed-answer trace

Exact gap: `ClientGatewayTraceRecorder.flushOnce` catches `writeArtifact`/`appendEvents`/`writeManifest` failures, marks private failure/loss state, and resolves. Therefore even `await sink.flush()` is NOT success proof. `recordControl` returns a public enqueue result; a copied `recorded` DTO is not authority. Existing periodic flushing is also not an invocation-bound acknowledgment.

Require a small additive acknowledgment path owned by the **actual canonical recorder** (`client-gateway/trace/recorder.ts`), with its screening/flushing/episode adapters forwarding the original owner. It must authenticate the original record operation and persisted sequence/prefix, await all writes for it, and issue completion only from that owner after real success. An arbitrary structural `ClientGatewayTraceSink`, its `status()` value or a callback returning `{recorded:true}` cannot implement authority by resemblance. Keep the current synchronous/best-effort APIs unchanged for legacy callers.

Canonical parking's trace dependency is an explicit consumed-answer port constructed by that owner, not an import of `AutomationStudioGatewayTraceInstallation`. Its production episode adapter must pin the actual episode/sink and callback before awaiting, retain current screening and record ordering, and await the actual acknowledgment before issuing the enclosing wait receipt. The existing installation/episode algorithms themselves belong in canonical gateway trace ownership; the old Studio installation path can only forward compatibility. Do not create a second installation or bypass its screen.

If tracing is disabled or no episode exists, the original trusted adapter proves the absence of trace work. If an actual trace write is lost/refused/unsupported, preserve the answer/public best-effort semantics while leaving coverage unknown/pending. Do not silently turn a missing trace acknowledgment into a settled receipt or add a new fatal trace failure to legacy calls.

### Activity delivery

Exact production chain: `programs/_shared/runtime.ts` subscribes an original callback that calls `clientGateway.publishActivity`. The canonical hub invokes arbitrary listeners synchronously and swallows their errors. The canonical gateway activity publisher calls `transport.sendUnqueued`; that method discards a returned `socket.send` Promise into a best-effort catch, then returns a boolean/count. None of those returns proves completion/quiescence.

The prerequisite is an additive observed/acknowledged path through the **actual canonical** `runtime/activity/hub.ts` and `client-gateway/service/{activity-publisher,transport}.ts`, consumed by the activity parking decorator. Pin and invoke each original subscriber/socket method once, retain its actual returned Promise, and observe/await supported actual sends. Preserve project/capability filtering, unqueued/drop behavior and best-effort public error isolation. Do not resend as a way to obtain a receipt. Unsupported/custom subscribers or opaque sends keep coverage unverified; disposal/presentation naming grants no purity exemption. A subscriber that increments a counter and fulfills/throws is the required negative.

The two wait/resolution emissions must be ordered around the actual inner wait just as today. If the original wait throws, preserve that exact error; a subsequent blocked/failed resolution notification must not mask it. Public activity failures can remain isolated while coverage is explicitly unverified. This is not a request to make ephemeral activity durable or to invent a second command ledger.

## Bounded implementation ownership and handshakes

| Release | Exact source ownership | Must not touch / handshake |
| --- | --- | --- |
| Parking producer | New `runtime/parking/conversation/{host,input,port,wait,consumed-answer,index}.ts` and immediate `tests/`; old `programs/automation-studio/runtime/parking/conversation-port.ts` as compatibility facade | Canonical ask/parking contracts unchanged. Root owns public/parent exports. Tools/forwarding are C-owned; consume their stable API only. |
| Activity decorator | New `runtime/activity/ask/{port,resolution,index}.ts` and immediate `tests/`; old `programs/automation-studio/runtime/activity/ask/port.ts` and the exact resolution facade | Existing concrete ask labels/rendering remain a supplied presentation concern until moved deliberately; canonical runtime must not import the Studio presentation functions. Root owns registration/composition and shared activity/gateway changes. |
| Conversation data prerequisite | Existing `conversations/{thread,turn,rows,inputs,writer}.ts`; the named data-service slice of `conversations.ts`; new `runtime/interaction/conversation/**` and `storage/project/conversations/**`; immediate owner tests | Do not take `conversations/commands/**`, instruction/model interpretation, API actor checks, panel UI or arbitrary attachment resolution. Coordinate the mixed-class slice and old aliases with Root. |
| SQL prerequisite | Existing `storage/project/{unit-of-work,database,statement-cache,store-unavailable-error}.ts`, `storage/schema-migrations.ts`, exact neutral administration/schema slices, and new canonical SQL/mutation/migration owner | Separate written release required; no wholesale Studio schema/model move. Existing storage/writer workers keep ownership until explicit handoff. |
| Trace acknowledgment prerequisite | Canonical recorder/type/own tests; exact gateway-trace `open-episode`, `episodes`, `screening-sink`, `flushing-sink`, `installation` adapter slices | Root-owned shared seam; needs explicit release. No trace payload logging, raw-answer digests, duplicated episode state or new history ledger. |
| Activity acknowledgment prerequisite | Canonical hub/contract, actual gateway activity publisher/transport slices; Root's exact `_shared/runtime.ts` registration | Root-owned shared seam; needs explicit release. Do not edit generic Source, A1/A2, claim/storage authority, socket wire contracts or producer handles. |

This worker owns **only this report** now. The table freezes a proposed file partition, not source authorization. For the next implementation brief, freeze the trace/activity acknowledgment interfaces first; parking constructors can then consume them without temporary unsafe certification.

## Focused acceptance to require after source release

Preserve all assertions in the existing selectors (read, **not run** in this discovery). The first five bullets use paths relative to `packages/fluxiq/src/programs/automation-studio`; the last names the canonical owner relative to `packages/fluxiq/src`:

- `runtime/parking/tests/conversation-port.test.ts`: exact ask projection; listen-before-read wake; deadline/answer race; missing ask error; cancellation leaves question pending.
- `runtime/parking/tests/conversation-port-trace.test.ts`: original answer/unanswered in the original waiting episode; no event after failed wait; tracing-off/no-episode behavior.
- `runtime/activity/ask/tests/port.test.ts`: waiting emitted after open, exact resolution/cancellation ordering, original error, answer beats cancellation, absent inner wait remains absent.
- `runtime/conversations/tests/{store,conversations}.test.ts`: real SQLite write/ask/answer identity, exact replay, answered-once/choice rules and turn-before-thread change-feed ordering.
- `tests/conversation-parking.test.ts`: real Service/API actor, real project store, answered/default route, retained state and no repeat of preceding output. Preserve both original oracles.
- Canonical `runtime/execution-observation/queue-completion/tests/receipts.test.ts` remains the sole receipt contract regression; do not mirror it with a weaker fake.

Add immediate canonical owner tests, plus one common parking/store integration subject with a temporary real project database and real A1/A2 durability:

1. **Positive:** actual canonical writer/store open commits one original turn/ask/change sequence; actual answer read/expiry and consumed-answer trace acknowledgment complete; exact original Promise/receiver/method/tuple earn one-use receipt and allow the real subsequent delegate. Same-project thread reuse and concurrent separate-project ports preserve identity; no private handles in JSON.
2. **Held commit/cleanup:** pause the original transaction acknowledgment or required lease cleanup around the real operation; while held, public operation and admission stay pending and a retry sends nothing. Release once; one row/receipt/continuation only.
3. **Post-commit lost ACK:** let the real transaction commit, then reject the original acknowledgment. The original error survives, the row remains, no receipt is issued, and actual retry is refused before a second append. Release/reopen the real admission store and verify coverage still blocks; do not clear it by seeing the row.
4. **Unknown host:** original custom writer/expiry/listener increments a counter and fulfills with a forged success value, or mutates then throws. Preserve the first observable outcome; no next host callback, generated look, retry or reopened execution can gain clearance. Test replaced getter/function, foreign receiver, wrapped/copied Promise and reused receipt without re-invoking IO.
5. **Trace loss/hold:** hold the real append/manifest write; no wait receipt before acknowledgment. A lost ACK or recorder loss that `flush()` swallows still gives no credit. Preserve original answer/no-answer event order and original public result; failed wait emits no consumed-answer event. Off/no episode requires no fabricated event.
6. **Activity sink:** actual supported send Promise held/rejected; subscriber counter+fulfilled/throw negative; actual project/capability filtering unchanged; no resend and no status-derived credit. Original rejected wait remains primary even if cancelled-resolution emission is blocked or fails.
7. **Abort/race/cleanup:** abort while waiting or after an owning write but before receipt; late acknowledgment never clears interrupted coverage. Always detach the original listener/cancel timer exactly once, observe supplied cleanup semantics, preserve answer-wins-expiry transaction arbitration and aggregate genuine primary+cleanup failures.
8. **Reopen:** reopen project and admission storage after supported completion versus uncertain completion; the persistent ask/answer and coverage facts agree. Do not claim the lost in-memory run itself resumes. Existing durable parked-run API routing remains covered by the original Service selector.

Run only those immediate subjects, an isolated strict check rooted at the actual producers/adapters, and scoped structural/full+erased Studio-free source closure once all prerequisite sources are frozen. No full suite, normal build, provider, live ask, browser, panel or user data is needed for this cut. Public/barrel identity checks should prove old APIs are the same canonical owners.

## Observed limits

This is source inspection, not execution evidence. No current production parking callback has been newly certified. Existing canonical context/promise APIs were read and C confirmed their stable names; this worker did not rerun their tests. Trace/activity completion APIs and the SQL foundation extraction need Root-approved contracts/releases before a complete production implementation. No source freeze was lifted by writing this plan.
