# Secret delegate completion prerequisite

Status: READ-ONLY discovery complete. No source/test changes or checks. Dispatch: `../briefs/secret-delegate-completion-discovery.md`.

The first coherent cut should add a trusted native Secret Keys execution-port factory, the actual internal observed operations, and native acknowledgement for the exact repository list/put path. Registering the existing five public methods as pure or accepting their fulfilled Promises would be false. Preserve the public methods and supplied SecretPorts tuples; give only the real Core composition a separate internal per-call observation seam. Root explicitly approved this direction during discovery. The current model files are an active worker snapshot, not accepted integration proof.

## Actual production path and operation facts

`programs/_shared/runtime.ts:95-98` constructs the real `SQLiteRepository` without a connection pool, then the real `SecretKeysService`; `:218-222` passes that same service as `ports` to the session provider resolver. The repository's old program path is already an exact alias to `framework/persistence/sqlite`.

`runtime/models/secrets/session-key.ts:49-55` pins the original delegates, then invokes `snapshot` on the original ports receiver with `[]`. Later tuples are `unlockedSessionFor(userId)`, optional `authorizeUseKey(userId,keyId)`, `createSessionRevealAuthorization(originalInput)`, `revealKeyWithAuthorization(originalInput)`, and mismatch cleanup `revokeRevealAuthorization(id)`. The fallback session remains the caller's own live unlock. A native adapter must not change arbitrary supplied callback receivers or these legacy tuples.

| Exact Service method | Work that must really finish | Safe classification |
| --- | --- | --- |
| `snapshot():128` | `store.load()` -> shared first `repository.list({})`, record guard, metadata projection and ordered sort | Async native/cache owner; not pure on an unproved load |
| `createSessionRevealAuthorization():321` | Load; injected/default clock; original custody reads; expiry/ownership/version/TTL checks; copied held key; native expiry timer; hold one-use authorization | Managed operation; timer/grant issuance is real owned work |
| `revealKeyWithAuthorization():356` | Original authorization read and claim BEFORE await; load; synchronous authenticated decrypt; memory update; exact queued repository put; final original authorization/clock/TTL check; revoke and zero copied key | Managed operation; do not acknowledge before put/cleanup or infer completion from returned value |
| `revokeRevealAuthorization():407` | Original `HeldKeys.revokeAuthorization`: clear the native expiry timer, zero buffer, delete authorization | Sync public mutation, not a read-only callback; observed counterpart must await its actual owner |
| `unlockedSessionFor():426` | Default parameter invokes `this.now()`; original `sessionsFor` enumerates held metadata; choose latest live nonempty unlock | Data-only only AFTER authentic clock and original custody-read coverage |
| optional `authorizeUseKey` | Absent on the concrete production Service; present only on a supplied/mixed-in port | Arbitrary host callback; preserve original pair/tuple and require its own completion |

`HeldKeys.sessionsFor/session/authorization` are inspected data reads on the original Core instance. `toSummary` and `publicRevealAuthorization` are inspected local projections. None justifies declaring an override or an injected clock pure. The create/reveal path does not derive passwords, upgrade seals or publish credential changes: do not expand this unit into those unrelated mechanisms. Decrypt uses the already-held key through `SecretValueSealer.openRecordWithKey -> open`, synchronously; its original Core implementation must remain pinned.

`HeldKeys` may be injected and outlive a Service eviction. Its expiry callbacks own custody and identifiers rather than the Service/password input. Do not cancel expiry, await an entire TTL, or revoke another user's unlock to manufacture completion. A completed grant operation may own its existing revocation-only expiry timer; reveal/revoke must retain the original authorization identity and race checks.

## Exact native and callback closure

`SecretKeyStore.load():33` shares `loading` and resets it after a failed read; `readRecords():91` awaits the original repository `list({})` then replaces guarded in-memory records. Concurrent observed reads must retain the one real first-read acknowledgement, not move its parent between callers or treat any fulfilled cached Promise as proof. A load begun through an unsupported owner cannot become verified merely because an observed caller later awaits it.

`SecretKeyStore.persist():65` queues a closure through `RecordWriteQueue.enqueue` and reads the CURRENT record when that closure runs. It then awaits the original repository `put(originalEnvelope)`. Preserve per-record order, concurrent different records, deletion suppression and original error propagation. Capture each call's actual child before enqueue; the queue is not an ambient current-call slot. No change to its scheduling algorithm is needed.

Actual native closure: `framework/persistence/sqlite/repository.ts` `list:34` / `put:162` -> `withDatabase:278` -> existing database operation queue -> `connected:259` -> native open/setup/query/run and native close. List may create the file/schema; it is not a pure read. Put acknowledges only after its real SQLite callback and required cleanup. The current default production route has no injected pool. A custom Repository or pool must supply genuine original owner coverage; class/name/status checks cannot grant it.

Native wrappers at `repository.ts:369-430` currently resolve from SQLite callbacks, but there is no observation/native-commit receipt in this owner. The cut must establish an original-operation witness at those real callbacks and issue the ONE canonical original-Promise receipt only after the exact operation and cleanup complete. A row read later, a timestamp, an empty pending count, the result envelope or Promise fulfillment is insufficient.

One additional real frontier is SQL telemetry: the native callbacks call `recordSqlPerformance` before resolve/reject; it calls `framework/observability/performance/registry/publish.ts:8`, which invokes arbitrary subscribed listeners. Do not certify those listeners as local metrics. Observe original listeners with their actual tuple/current child, drain genuine supported work, and fence unsupported work before later model transport. A thrown listener currently runs inside the native callback before settlement: the new observed path must preserve that error and avoid claiming native quiescence from a never-settled Promise. No subscriber source or external telemetry backend is included in this discovery.

Injected `now` is another callback frontier (including BOTH reveal clock reads). Default native clock can have an exact original-function declaration; a supplied clock needs authentic coverage. `unlockedSessionFor`'s default parameter cannot execute an unobserved custom clock before the new observed body obtains context. Retain legacy synchronous behavior; the observed entry must make that original clock call explicitly under its actual child.

## Stable proposed internal seam

Use the existing opaque `ExecutionCallbackObservation`, existing Owned preparation/carrier machinery, Policies and `OriginalExecutionPromiseReceipts`. Do not introduce a ModelRequest field, Source owner flag, current/global/ALS receiver scope, second context registry, command ledger or a second asynchronous receipt authority.

Proposed trusted factory: `createSecretKeysExecutionPorts(originalService)`. It pins the original Service receiver and each exact Core prototype operation before any await. Root alone supplies this capability at real program composition. A copied ports object, subclass override, JSON, metadata or method name cannot supply it. Arbitrary supplied SecretPorts continue through their original callback path and remain unsupported unless their actual owner supplies a contract.

Its narrow INTERNAL operations take a separate per-call observation (illustrative signatures, not a new broad DTO):

```ts
snapshot(observation: ExecutionCallbackObservation): Promise<SecretKeysSnapshot>;
createSessionRevealAuthorization(input: OriginalCreateInput, observation: ExecutionCallbackObservation): Promise<SecretRevealAuthorizationMetadata>;
revealKeyWithAuthorization(input: OriginalRevealInput, observation: ExecutionCallbackObservation): Promise<OriginalRevealResult>;
revokeRevealAuthorization(id: string, observation: ExecutionCallbackObservation): Promise<void>;
unlockedSessionFor(userId: string, observation: ExecutionCallbackObservation): Promise<string | null>;
```

`Original*` denotes the EXISTING rich Service types, not new duplicate contracts. Each native adapter prepares its actual internal operation, makes that operation's genuine child available to the body, and pins the original tuple before invocation. The public methods delegate to that same body once with undefined execution; do not copy algorithms into an observed wrapper. External/raw provider arguments and all arbitrary SecretPorts tuples stay unchanged. The internal asynchronous revoke/session-read entrances let the owner observe a real clock/custody mutation without weakening generic managed Sync or labelling mutation read-only.

This explicit seam is necessary: create/reveal already have fresh object arguments that a checked carrier can authenticate, but `snapshot()` has no argument and the other two take scalars. Existing `Owned.bindCarrier` requires an original tuple member; binding the shared Service receiver is unsafe under concurrent calls. New internal entries may use a fresh internal carrier in their own pinned tuple, read only through the SAME existing Bindings authority. No raw extra adapter argument or new per-service current observation is needed. Root/B must freeze the exact native-factory injection point before implementation; there is currently no such supported production port.

Native receipts must match original returned Promise, actual entered child/source/parent and one-use owner completion. Keep a genuine rejected-operation receipt only when the original native work and cleanup are authentically complete. Write-then-lost-ACK or incomplete cleanup stays pending across retry/reopen, even if the secret value was otherwise recoverable. Do not include plaintext, ciphertext, authorization/session tokens, passwords or secret-derived hashes in diagnostics or completion digests.

## Smallest disjoint implementation ownership

1. Secret owner worker: exact five methods plus constructor pinning/common private bodies in `programs/secret-keys/runtime/service.ts`; needed `key-store.ts` load/persist closure; exact custody operations in `held-keys.ts`; cohesive new `runtime/execution/**` factory/operation/receipt leaves and immediate tests. Keep all seal/credential-change/KDF/unlock algorithms and all other public APIs out of scope. Inspect/pin the existing sealer; do not move its algorithms merely to attach context.
2. Native persistence worker: exact `framework/persistence/sqlite/repository.ts` list/put/native callback/cleanup path plus cohesive `sqlite/execution/**` owner and immediate tests. Preserve the existing operation queue and native arguments. Release pool source only if its actual owned path is supported in this unit; production default does not require it. The separate telemetry listener boundary must be explicitly owned rather than silently certified by this worker.
3. Root integration: `programs/_shared/runtime.ts` factory binding and the exact session-provider resolver constructor option. B owns the minimal `runtime/models/secrets/session-key.ts` dispatch bridge for configured native ports, preserving arbitrary callbacks. Public parents/config/package belong to Root. Freeze that bridge before dispatch; no competing edit to B's current model unit.

Must not touch instruction/policy/Source/Bindings/receipt internals, model transport/provider contracts, spend/creation persistence, other storage owners, Studio service composition, git or baselines without a new bounded release. The existing actual Secret Keys program remains its own credential/custody owner; no Automation Studio dependency is needed. Shared native repository acknowledgement belongs in canonical framework persistence, never in a Studio wrapper. Existing public key/auth/result metadata types remain sole authorities.

## Acceptance to require after release

Existing immediate selectors: `programs/secret-keys/runtime/tests/{service,key-store,record-write-queue,unlocked-session-for,held-keys-eviction,revoke-session-unlock}.test.ts`; model compatibility `programs/automation-studio/runtime/llm/{tests/session-key-provider,deepseek/tests/session-key}.test.ts`; canonical native repository adjacent tests. Run only these subjects/selected cases and scoped strict/declaration/erased/import checks at a coordinated immutable window.

New native positive: isolated real SQL and real controlled custody; one original method/receiver/tuple, real list/put ACK, final reveal check and zeroing, no wire fields or leaked value. Hold native put ACK: no completion and zero provider send while held. Release ACK: original value/result/error behavior, one-use authorization and clear coverage only after genuine child closure.

New negative: actual native write then lost ACK/throw, delayed reveal past TTL, expiry/revoke/rotation during pending IO, cleanup failure with original primary retained, foreign/copied/stale/replayed completion, unsupported repository/clock/custody/listener/authorize callback. Reopen the same durable scope with changed input/revision and prove zero second provider send. No fresh scope/epoch or result flag may erase prior unknown.

Concurrent coverage: one shared cold load without parent substitution, two distinct authored operations, same-record queue order and cross-record independence; factory/default-clock identity pinned before await; arbitrary injected overrides get no contract. Unobserved APIs preserve current sync start/return type, one-use/TTL rules, redacted snapshots, original auth and errors. Existing held-key eviction/timer oracles remain unchanged. Tests use synthetic keys in isolated temporary stores and never log them or contact providers.

Validation performed: source inspection only. No runtime proof, tests, typechecks, builds, native operations, secrets/runtime stores or credentials were read or executed. Prior instruction and change-trial source/test holds remained intact.

Outcome: Done
Changed: docs/working/runtime-ownership-refactor/reports/secret-delegate-completion-plan.md only
Validation: exact named source methods and required native/callback closure inspected; no tests/checks (read-only brief)
Not verified: runtime/native receipt correctness, exact future factory injection, concurrency/reopen behavior, strict/build/provider/browser integration
Report: docs/working/runtime-ownership-refactor/reports/secret-delegate-completion-plan.md
Notes: Root approved an explicit trusted internal per-call seam; implementation not authorized here. No source/test/git/shared-doc mutation. Change-trial remains paused.
