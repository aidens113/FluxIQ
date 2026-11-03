# Native SQL completion — read-only implementation plan
1. Frozen authority: `framework/persistence/sqlite/execution/ports.ts`: `RepositoryExecutionPorts<T extends JsonObject>` with `readonly original: Repository<T>`.
2. Exact methods: `list(scope: RepositoryScope | undefined, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>[]>`; `put(record: RecordEnvelope<T>, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>>`.
3. Factory: `createSQLiteRepositoryExecutionPorts<T>(original: SQLiteRepository<T>): RepositoryExecutionPorts<T>`; reject unsupported pool/override/non-original instances before native IO, using genuine constructor provenance and pinned native members, never class/name/shape alone.
4. Preserve public `Repository.list(scope)` / `put(originalEnvelope)` and arbitrary caller tuples; share each actual algorithm once with a separate internal observed entry.
5. Proposed dispatch: exact factory port pairs are Core owning frames; native factory prepares its real managed SQL child before queueing, retaining that actual child through a fresh internal original carrier via existing Owned/Bindings.
6. B authenticates original repository and exact factory pair; a copied/forged ports object gets no frame/receipt contract. No identity-only or fulfilled-Promise completion.
7. Repository-owned slices: constructor provenance, list/put shared bodies, `withDatabase`/`connected`/open/setup and native `run/all/get/exec/close` callbacks needed by those two operations; pool implementation stays untouched/unsupported initially.
8. Keep `enqueueDatabaseOperation` and existing performance ALS solely for metrics; pass execution explicitly through private calls, never receiver/global/ALS current-observation state.
9. Private per-operation witnesses become true only at actual original native callbacks; issue the ONE existing original-Promise receipt only after query/setup ACK, owned close and every child complete.
10. Preserve SELECT/UPSERT SQL, original scope/record receiver identity, result projection/order, native callback arguments and public unobserved scheduling.
11. Telemetry slices: `performance/sql/record.ts` and `registry/publish.ts`; retain one ring/listener Set and exact copied-metric/undefined-receiver listener tuple.
12. Observed telemetry prepares/invokes each original listener, awaits its actual return and authentic completion, and keeps unsupported/throwing work unknown; no blanket metrics purity.
13. Native callback adapters must capture telemetry failures and settle their operation rather than leave an unresolved Promise; preserve primary error plus distinct cleanup failures.
14. Always perform owned native cleanup/drain after failure; never certify write-then-lostACK, incomplete close or unsupported listener from a later row read/result/status/reopen.
15. Existing receipts, Policies and Bindings remain sole authorities; no new scope registry, host mutation, secret-derived diagnostic or observer wire field.
16. Focused future proof: real isolated list/put, held native query/close, listener held/throw/unsupported, queue order/concurrency, original errors, copied/stale/foreign proofs and persistent lostACK/reopen refusal.
17. B owns SecretKeyStore cold-load/record queues and native service/custody; Root owns public exports/config/composition. Confirm this factory-frame delegation with B before dependent edits; no new DTO.
18. Read-only source inspection only; no implementation/tests/checks/native operations/secrets or runtime stores accessed. Source remains frozen pending explicit release.
