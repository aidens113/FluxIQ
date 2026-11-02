# Actual queued spend settlement acknowledgement
Role: Heavy worker; gpt-6.1-sol, Max. No agents/git/shared working documents.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Goal: instruction read waits for the original provider call's ACTUAL queued spend commit, not whole-build exit or a generic fulfilled flush.
Own service/creation-spend.ts withFlowPurse/add/persist ownership, runtime/agents/budget/{types,call-hold,settlement-ledger,purse,flow-scope}.ts exact additive settlement seam and immediate tests.
Source path today: onSettled queues ORIGINAL this.add Promise, returns void; only whole-build finally drains writes. add awaits persist ->ensureProjectStructure +canonical ProgramJsonStore.write.
Stable shared seam: existing OPTIONAL ExecutionCallbackObservation in separate INTERNAL call/hold/settlement options, never model request/provider adapter args/wire data. Coordinate signatures with B model/harness and C creation.reading before dependent edits.
Preserve original synchronous hold/charge/settle/accounting APIs and counts; add observed async checkpoint/settlement rather than settling a hold twice or attributing by flowId/global queue position.
Capture exact original call token/context/receiver/function and queued write prefix. A receipt follows actual canonical storage acknowledgement and all child callbacks; bare amounts/memory totals/status/Promise fulfillment do not certify IO.
Use single canonical Source/AuthoringScope/OriginalExecutionPromiseReceipts; no duplicate scope/receipt registry, root reissue or stale/cached parent revival.
Preserve real queue order, rootless/file/SQL bytes, first-error identity when cleanup succeeds and unknown/reopen refusal. Drain all owned pending work; if run and write failures coexist, expose both without masking the primary or leaving writes unattended.
Must not touch B runtime/models or llm/harness, C instruction/once/creation.reading, Root service.ts/fixture/parents/config/baselines, previous storage/metrics bodies or unrelated spending features.
If shared generic budget contracts require a broader exact leaf, name it before editing. Keep dependency direction neutral; Studio spend owner is temporary until full canonical migration.
Focused tests: actual held ProgramJsonStore write; original onSettled call binding; real write+lost ACK and independent reopen zero second IO; interleaved calls get their own prefix; cached/unsent reading no new charge; existing accounting/ceiling/refusal tests unchanged.
No provider/live/paid/browser/panel/user-data operations or whole suites. Freeze before joint checks.
Report docs/working/runtime-ownership-refactor/reports/spend-settlement-completion.md with standard return contract.
