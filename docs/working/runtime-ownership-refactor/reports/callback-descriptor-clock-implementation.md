# Callback descriptor and native clock partial handoff

Status: STOPPED at the user's explicit request, before further implementation or tests. Source/tests FROZEN. No runtime/compiler/tool command remains active. This report is the only write after the stop.

The last validated checkpoint is Root's pushed snapshot before this implementation release. The following saved changes are incomplete scaffolding, not an accepted or compilation-verified unit. No source was reverted or removed after the stop.

Saved production paths in this partial cut:

- `framework/clock/native/{functions,read,index}.ts`: one original Date/now and Math/random descriptor capture, shared availability/assert/read helper.
- `framework/clock/index.ts`: one-line parent created early by C, explicitly adopted by Root as integration-owned.
- `framework/observability/exchange-log/native/{functions,invocation}.ts`: Date identity extraction consumes the shared helper; native log clock checks current identity at actual read. Existing Stage1 public signatures and per-invocation state remain in the same owners. Not retested.
- `engine/automation/execution-admission/options/{descriptor,data,enumerable}.ts`: descriptor walk, data-only lookup and enumerable-copy guard.
- `engine/automation/execution-admission/options/{record-batch,index}.ts`: existing record callback guard reuses that descriptor walk; barrel exports new leaves.
- `engine/automation/execution-admission/copy.ts`: original observed sources/changes are checked before the existing spread; private companion propagation remains unchanged.
- `engine/automation/execution-admission/internal/coverage.ts`: preflight reads descriptors instead of evaluating callback/host getters and no longer trusts the current mutable Date.now/Math.random. Existing temporary named unsupported-key diagnostic remains.
- `engine/automation/execution-admission/kernel/callback/{unknown-sync,property,observed-property}.ts`: actual-read/fencing helpers, currently unused by actual clock/host consumers.
- `engine/automation/execution-admission/kernel/callback/{unknown,index}.ts` and `kernel/index.ts`: existing async marker delegates the new sync marker and keeps its flush; helpers exported through internal feature barrels.

Known incomplete integration and limits:

- No new descriptor/native-clock tests were written or run. No strict/declaration/scoped/whole check, build, provider, browser, or git command ran for this cut.
- Coverage's typed static host-key list has not been checked against the current host contract; historical Reflect.get keys may need truthful dynamic DATA lookup without widening the contract.
- Live/default wrappers still delegate mutable globals. Their existing identity remains in coverage's trusted wrapper set until actual-call validation is implemented; the complete clock defect is NOT fixed.
- Constructor input/private observation accessor refusal, environment reads, model defaults/clock, direct engine clocks and actual host/callback read consumers remain unchanged. The new actual-read helpers do not protect callers until integrated.
- The requested `internal/driver.ts` prepare correction is NOT implemented: its early signal read and entered-frame failure/flush path still need descriptor-safe treatment.
- No edit to `brief-ports.ts` placing or `site-reset/act-places.ts` was made. The admitted-parent handoff is still missing at the read/capture/settled family.
- No generic Source/Bindings/receipt issuer, SQL, secret, model-log Stage2, root service, package/config, baseline, downstream, or shared working-document authority was changed by C.

Latest actual positive evidence is separately recorded in `start-state-admission-diagnostic.md` (25 lines): unchanged300s timeout, through submit at73.668s; pre-claim start-state producer waits in durable enter; cleanup abort is not the cause. No clean positive or native dataset completion is claimed.

Read-only awaited-mechanism trace: Lifecycle.track returns the same persistence Promise; Store.pipeline immediately starts its operation and only tracks it. Enter mutates through UnitOfWork's shared database FIFO transaction, then rereads full inventory in a second FIFO transaction. Those transaction bodies use supplied direct SQL. No self-wait was demonstrated. Actual start-state callback had not been invoked at the reported abort.

Shortest coherent completion would require the already-approved descriptor/clock plan, current-parent handoff and finite regressions on frozen closures. This is a dependency description for planning only; implementation permission is revoked. Root may instead selectively restore the saved partial paths to the preceding validated checkpoint. C has taken neither action.

Outcome: Partial
Changed: exact saved production paths above; this own report and start-state phase report.
Validation: not run for the partial cut; stopped before new processes at explicit user request. Prior positive diagnostic exit1/391.28s remains a failed diagnostic, not acceptance.
Not verified: compilation/runtime compatibility of partial scaffolding; complete accessor/clock safety; exact durable-enter wait cause; full Service positive/native dataset ACK.
Report: docs/working/runtime-ownership-refactor/reports/callback-descriptor-clock-implementation.md
Notes: SOURCE/TESTS FROZEN; no active command; no further code/test work authorized. No git; Root owns integration and disposition of saved partial changes.
