# Queued project writer completion

Status: bounded receipt unit implemented and accepted by worker checks; all owned source/tests frozen. Final current nine-subject selection passed 58/58. Previous verification data sources remain frozen. Root independently verifies this claim; no full-Service acceptance is claimed.
Brief: [queued writer completion](../briefs/queued-writer-completion.md).

Final user boundary clarified by Root: AutomationStudio contains only panel UI and thin framework control adapters. Every runtime, authoring, verification, persistence and orchestration authority belongs in the framework. The Studio Store/Documents/ProjectLedger and programme receipt-helper locations in this bounded unit are temporary compatibility placement until the canonical project/persistence migration; they are not an accepted architectural exception or completed ownership refactor.

Owned original leaves: service/project-build/acts-record.ts; service/project-build-toggles/toggles-record.ts; flow-bootstrap/site-reset/project-ledger.ts. Root additionally released exact constructor/read/update/apply slices in project-agents/record/documents.ts and constructor/read/recordLastingAct/recordToggle/private change in record/store.ts, plus immediate receipt leaves/tests. No other store methods or ProgramJsonStore/SQL sources are owned.

Actual commit closure: RecordStore owns a newly constructed BuildDocuments. Its memory branch owns its Map; persisted updates construct the Core ProgramJsonStore and await its serialized update. ProgramJsonStore awaits its own lock/read/mutator then SQL put acknowledgement or temp-write and rename acknowledgement. There is no formal injected-document port. Supplied records/persist/change/now callbacks still require actual observation and authentic completion; a fulfilled injected callback is insufficient.

Approved neutral receipt API: OriginalExecutionPromiseReceipts.issue(originalPromise, originalSource, originalParent, completion) and consume(original callback completion input). It only retains explicit owner issuance against the original Promise and actual source/reservation/entry. It pins canonical Source context/frame readers, rejects duplicate issuance/reuse, consumes once and requires every actual child settled. No automatic issue from fulfillment, DTO or status; no admission rights. Missing authentic completion of an effectful successful callback is terminal unknown; rejected callbacks stay pending with their original error.

Approved additive async writer APIs: acts.trialRanAndFlushed(acts, runId, invocation?), acts.syncAndFlushed(invocation?), toggles.syncAndFlushed(invocation?), and invocation-aware projectLedger.flushed. Legacy synchronous enqueue/void paths remain. Public producer methods must explicitly return their retained original Promise instead of relying on an async method's inner Promise identity.

C confirmed the original recorded sink tuple object can receive a private companion before invocation. The owned sink captures that original context synchronously and returns its original Promise only in the observed path; legacy enqueue remains void. Root owns caller wrappers and rememberManaged policy registration; C owns reset/gates/ledger and recording sink threading. No ambient current slot, extra host/model fields or serialization of observation state.

## Implemented ownership

The neutral `runtime/execution-observation/queue-completion/{receipts,index}.ts` retains only explicit original-Promise receipts. Canonical context/frame/completion readers are pinned before awaits. Consume verifies the actual source owner, original reservation/entry, pending invocation and complete child frontier. Duplicates, copied/substituted Promises and bare unacted DTOs grant nothing. Abort remains unknown even after late acknowledgement and explicit recheck. Missing receipt on a fulfilled effectful producer is terminal unknown; original rejected outcomes stay pending.

`project-agents/record-completion/{owner,invoke,index}.ts` registers actual owning receiver/function/receipt reader once through Root's manage-only snapshot policy. It captures the original private C invocation before queueing and delegates actual callback observation to C, using a fresh private carrier rather than an ambient current slot. It accepts the genuine original undefined receiver for lexical persist callbacks.

BuildDocuments read/update issue only after their own memory operation or fixed Core storage acknowledgement. Replaced storage methods, supplied mutators and clocks are observed before calls. A replaced storage method's original mutator function argument privately carries its actual child, so its work is nested correctly; no argument fields or tuple values are replaced. Store selected methods wait for actual observed Documents, and mutable injected now callbacks remain unsupported unless an authentic owner configures them. Default Date.now is the fixed original Code declaration.

Acts and toggles pin actual Records methods/receivers when bound and wait the real serialized queue before issuing. Existing refusal handling, first-error retention, ordering and deduplication remain. A legacy unobserved queued write cannot be retroactively certified by a later flush. Root must pass private context when enqueueing through the additive async methods.

ProjectLedger's observed sink uses the original constructor options receiver and original recorded tuple object, captures it synchronously, and returns its original Promise after persist flush. Its legacy sink remains void. Exact original data callbacks are declared at their actual factory; mutable brief data methods are synchronously observed, preserving their result and marking unsupported overrides rather than hiding them under a pure wrapper. C owns the original intrinsic Ledger declarations and async receiver handoff.

## Final observed checks

Commands ran in `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ` against Root/C/B's coordinated immutable source boundary. Every process completed exit0 and its output was read. All readers/guards ended naturally; Root/C/B were notified, and no further writer checks are planned.

| Exact command | Observed result |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .fluxiq/refactor/queued-writer-completion-tests.ps1` | 9 files / 58 tests passed, 78.01s. Normal source runner; no overlay or guard bypass. |
| `node .fluxiq/refactor/queued-writer-completion-types.cjs` | 47 exact owned/support/importer roots; 4,848 source modules; 0 diagnostics. Strict NodeNext, source paths, no emit/incremental shortcuts. |
| `node .fluxiq/refactor/queued-writer-completion-closure.cjs` | Neutral browser/data closure62modules, 0 errors/Studio/Node/built edges; erased runtime4modules/0 forbidden or unresolved edges; declaration emit0, not skipped, ignored output only. |
| `node .fluxiq/refactor/queued-writer-completion-structure.mjs` | 47 files; 15 official rules plus one-authority/barrel/EOF review; 0 failures, 14 existing-size/directory advisories and 16 unchanged-baseline findings. No baseline/config writes or transfers. |
| `node .fluxiq/refactor/test-support-grouping-verify.cjs` | All3 actual helper bodies and25 importer oracle bodies unchanged;226 relative edges resolve;3 barrels; old paths removed. |

The normal runtime script calls `pnpm.cmd --filter fluxiq exec vitest run` with exactly these subjects, relative to `packages/fluxiq/src/`:

- `runtime/execution-observation/queue-completion/tests/receipts.test.ts` —9: original Promise one-use, duplicates/copies/missing/foreign-parent refusal, unknown child, pinned readers, original error, bare unacted DTO, abort/late acknowledgement/recheck.
- `programs/automation-studio/runtime/project-agents/record-completion/tests/store-completion.test.ts` —6: actual memory/file/SQLite Store success, held real SQL write/root release, unknown clock stopped before native put0/no row and reopened/new-epoch refusal, actual committed write followed by original lostACK Error and no second IO after reopen.
- `programs/automation-studio/runtime/service/project-build/tests/acts-record-completion.test.ts` —3: actual Store flush, original method/receiver pinned at bind, held authentic supplied records/root release, unsupported fulfilled records/no second durable write.
- `programs/automation-studio/runtime/service/project-build-toggles/tests/toggles-record-completion.test.ts` —1: real queued toggle persistence before root closure.
- `programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/project-ledger-completion.test.ts` —2: original options sink and lexical persist through real SQL, unsupported persist stays pending and refuses another durable trial.
- Unchanged `service/project-build/tests/project-build-acts-record.test.ts` —5; `service/project-build-toggles/tests/project-build-toggles-record.test.ts` —5; `flow-bootstrap/site-reset/tests/project-ledger.test.ts` —13; `project-agents/record/tests/store.test.ts` —14, all under the same Studio runtime prefix. These preserve persistence/refusal/order/dedup/restart behavior and all old assertions.

All SQL tests use isolated temporary owned directories/pools, with the real Core storage and A1 durable store. No provider, browser, panel or user data was used. Strict checks also cover every moved support file/barrel and exact importer; all25 importer test bodies were not run as a separate runtime suite.

During development the real lostACK test initially stopped before the intended write: the actual original mutator was entered as a sibling of an observed replacement storage callback, so A1 correctly rejected it. The owned fix bound that original function argument to the actual storage child; the unchanged test then proved one actual write, original Error and reopen refusal. Later C's stronger unsupported callback guard intentionally poisoned the in-memory reservation before the next apply. Root approved the NEW clock oracle's exact `reservation_not_active` error: clock1/native-put0/no-row/pending/reopen remain mandatory. Earlier provisional 57/58 runs recorded that exact-error mismatch; the final58 run passes. No production safety algorithm or old oracle was weakened. Initial own barrel/packed-test findings were corrected; Root's production grouping and the mechanical support moves cleared the shared directory limits.

## Authorized test-support grouping

Root additionally released these three mechanical test-infrastructure moves (no production changes):

- `runtime/tests/replaying-binding.ts` -> `runtime/tests/replaying-binding/{binding,index}.ts`
- `service/project-build/tests/settled-builds.ts` -> `tests/settled-builds/{build,index}.ts`
- `service/project-build/tests/declared-step-resolution.ts` -> `tests/declared-step-resolution/{resolution,index}.ts`

All paths are under the same Studio runtime. Scoped rg found 25 importer files; every module reference and comment path was retargeted to the narrow barrel. Post-apply AST comparison proves all three actual helper bodies and every importer oracle body unchanged; 226 relative edges resolve and no old source-path reference remains. No actual test subject or assertion moved. B was notified that its runtime/tests slot is free. Final typecheck includes the exact moved helpers/barrels and importer files.

Not verified: full Service behavior or complete shared caller integration, full suites/builds, downstream, live providers or browser behavior. Root owns public parent exports and common caller wrappers; C owns reset/recording/synchronous unknown guards. Public neutral source/declaration closure is checked above; this is not built-package/full-Service acceptance. No source changes were made before the exact store expansion and neutral API release. Programme persistence placement remains temporary until the required canonical migration.

Outcome: Done
Changed: neutral receipt owner; bounded Store/Documents/three queued writers; private project completion factory; immediate tests;3 test-support groupings/25 importers; this report
Validation: 9files58tests;47roots4,848modules strict0;neutral62/4closure+declarations0;scoped47files0failures;support AST/226edges0 -> passed
Not verified: full Service, whole suites/builds, downstream/live, canonical project/persistence migration
Report: docs/working/runtime-ownership-refactor/reports/queued-writer-completion.md
Notes: Owned source/tests frozen; all readers ended; no git/agents/shared-doc/config/baseline edits.
