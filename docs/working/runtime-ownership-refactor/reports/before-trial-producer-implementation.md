# Actual before-trial and start-state producers

Role: Heavy worker, gpt-6.1-sol, Max. Bounded callback-owner unit complete;
SOURCE FROZEN at handoff. Lead-owned composed Service acceptance remains pending.

## Frozen boundary interfaces

- `CandidateTrialSourceInput.toolObserver?: AutomationStudioBuildToolObserver | undefined`
  is on disk. The configured Source retains the original B observer and pins
  its original `prepareParent` method/receiver once at construction.
- `Source.prepareToolParent(originalRequest, actualParent, originalRoot): Promise<void>`
  is on disk. It memoizes preparation for that original request/root, rejects
  a different Root for the same request, and delegates to the pinned method.
  It creates no A1 Source or reservation.
- Partial Root `prepared(parent, originalRoot)` awaits preparation before the
  actual callback and retains the original Root, observer, scope request and
  preparation port in the existing private context.
- Whole admission prepares on the original private checkout after its real
  reservation. Preparation failure records `observer_failed` on that owned
  original Root; cleanup failure preserves both errors. Read-only checkout
  returns before this path and obtains no committing proof.
- `Authority.callbackObservation(checkout)` returns only the existing actual
  active context/producers plus the original Root/tool handoff. No public
  request or model/adapter argument acquires observer fields.
- Prepared callbacks in the whole/partial private observation helpers are
  awaited. Existing synchronous prepared callbacks remain compatible.

The lead has wired the optional observer into the common build factory. B's
source helper confirms `prepareParent(uniqueBeforeTrialOptions, child, root)`
is the intended scope handoff. Each later
`bindParent(freshActualCall, actualCallbackParent, uniqueOptions)` receives a
fresh logical call series and the same authentic Root proof. Copy/retry seams
use B's inheritance helper instead and retain their original series.

## Approved hook direction

The lead approved async-compatible policy results before gate changes:

- reset `admit`: existing StepAdmission or Promise of that result;
- reset `trialRan`: existing NamedAct array or Promise of that array;
- partial `admissionPredecessors`: existing array or Promise of that array;
- `weighed`: `unknown`, awaited by the consumer, so legacy void callbacks
  returning incidental synchronous values remain assignable.

These callbacks will use real async observed calls. The neutral sync observer
is unchanged. No effectful callback or queued writer is called pure.

## Next owned implementation

The three actual leaves are `trial-defaults/before-trial.ts` and
`site-reset/{project-reset,start-check}.ts`, with cohesive private observation
helpers and adjacent tests. The prepared beforeTrial child will be bound to
its unique actual options object. A private typed call helper will observe
the exact original Core callback/receiver/tuple and bind a fresh internal
invocation object after entry. Core StartCheck methods receive that optional
invocation as their final internal argument; raw host argument tuples remain
unchanged. This avoids a current/global or receiver ambient execution slot.

`project-reset`'s supplied checks factory gains an optional second invocation
argument, preserving old one-argument implementations. The factory, supplied
checks, ledger/session calls and effectful policy hooks must all be observed;
their results are not certificates. Known Core frames derive only from actual
child completion. Unknown supplied callbacks retain an unverified frontier.

StartCheck's actual I/O is the original `binding.startState` in capture/read/
compare and the original executeTool in private arrive. The snapshot field
origin helper returns the original receiver/function pair. Each actual fresh
call object inherits its private parent/proof from the unique beforeTrial
options; the raw result/error is observed before mapping.

## Exact integration ownership still with lead/B

B owns `brief-ports.ts`, raw binding/registry/snapshot and tool request copies.
The lead owns common generic observation/service/create/public exports. The
brief wrapper must pass the optional invocation to the original reader
methods, use the same project/trial observer in the reader constructor, and
await the actual queued writer's flush. A receipt must belong to the original
returned promise and actual trusted writer; return status or a fulfilled
foreign promise cannot close it.

The project ledger and toggle writer can queue injected persistence callbacks.
Their ownership is distinct from the raw shop and native implementation
receipts. Merely tagging the outer reset/frame while those callbacks remain
unobserved is not a complete closure and is not implemented as an exemption.

The deferred change session is another actual phase boundary. Its original
`finish` runs from whole gate's siteChange closure (line680 at discovery) and
partial gate's corresponding closure (line503), after beforeTrial has closed.
The lead released those exact wrappers. A private original-session/options/
Root link will permit the original finish method to run under the CURRENT
original trial invocation, temporarily binding its captured options to that
actual finish child. Separate sessions, changed finish identities and a
different Root cannot reuse the link. A stale closed beforeTrial parent or a
new ordinary Root is not an acceptable substitute.

## Validation

Observed C checks during implementation:

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/start-check.test.ts src/programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/start-check-moves.test.ts src/programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/start-check-core-move.test.ts src/programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/project-reset.test.ts src/programs/automation-studio/runtime/flow-bootstrap/trial-defaults/tests/before-trial.test.ts`
  -> **5 files, 32/32 passed**, 28.81 seconds. Existing reset values, moves and
  original Core-move behavior remain unchanged.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/start-state.test.ts`
  -> **3/3 passed**, 32.70 seconds. Real original private receivers survive
  checked snapshots; two distinct reads are actual descendants of their
  reader frame on one authentic Root. Real counter-then-throw and fulfilled
  returns without receipts stay pending, blocking copied/changed/reopened
  calls before a second send.
- Initial narrow strict: **22 roots, 4,911 modules, 0 errors**. Initial
  fourteen-rule scoped structure: **0 failures, 5 advisory warnings**.
- A later strict snapshot after hook unions found two new fixture assignments
  using an overly wide, never-called executeTool method. Both now use a
  throwing callback matching StartCheck's actual Execute port. The same snapshot's phase-start
  Promise-admission caller was assigned to and fixed by the lead.

The lead has coordinated short immutable read windows for B's producer/
exploration consumers and its own narrow checks, then one normal library
declaration build. C source/test writes pause during those windows. No whole
package check/build/suite, provider, browser, baseline or git command was run
by this worker.

The private helper owner moved coherently to `flow-bootstrap/reset-observation`
to satisfy the actual depth budget. The old new-only deeper folder is gone.
The helper permits temporary scoped binding only on the exact pinned receiver
or an actual tuple object, captures the previous binding before await, and
restores it after the original callback. Returned checks therefore use their
original receiver as the current child carrier, never a captured closed
factory child.

The Recording async counterpart now shares one generator transition table
with the unchanged legacy synchronous path. Its observed callbacks pin the
original constructor options receiver/functions, while the old clone-based
legacy receiver behavior stays intact. The actual original recorded object
is bound privately before sink(recorded), and its runtime original Promise is
awaited. Selecting that path in the reset adapter and completing the ledger
callback/source tests remains active, alongside the writer owner's authentic
commit/flush producer.

The prior C unit remains independently recorded in
`candidate-retest-implementation.md`; its original full project-reset
consumer's second trial is not claimed passing. That known-blocked consumer
will not be rerun until the raw tool, reset and actual writer prerequisites
are present. Its first YES/stillThere/cart/undo/startpage and second-builder
oracles stay unchanged.

## Current implemented ledger and session closure

`site-reset/ledger.ts` now exposes these additive awaited entry points:

- `trialRanObserved(acts, runId: string | undefined, invocation): Promise<NamedAct[]>`
- `observedAndFlushed(read, baseline: boolean, invocation): Promise<void>`
- `exploredObserved(call, invocation): Promise<void>`

The constructor remembers only the original owning prototype functions.
Overrides receive no inherited completion declaration. The original
`explored` method still returns synchronously when unbound; under the original
private invocation it returns the actual queued sink flush Promise. The
project-reset adapter selects the awaited trial path only when its actual
acts argument carries the original private companion. Ordinary calls retain
their existing synchronous values and transition order.

The recording driver shares one generator with the legacy trial driver. It
pins the original constructor options receiver and callback values, binds the
original recorded object before invoking the original sink, and awaits the
runtime Promise. Queued failures retain an explicit rejected outcome and are
thrown from flush; they never become an empty successful value. The project
writer owns the independent actual persistence/commit receipt.

Supplied checks are invoked with their original receiver. Returned Core
wrappers use their current receiver as the child carrier instead of capturing
a closed checks-factory frame. Data-port owner links forward only the original
private parent, and mutable delegated data methods are observed individually.

Canonical deferred sessions retain their exact original finish function,
options and Root. Finish runs beneath the current original trial child and
temporarily binds only that session's original options to its actual finish
child. A copied invocation, different Root/reservation or changed method is
refused. A changed accessor is rejected through its descriptor without calling
the accessor before admission.

The asynchronous helper snapshots whether the original callback has a genuine
contract. An unsupported fulfilled callback preserves its first result but
records terminal unknown and awaits the real source flush before returning.
The synchronous owner uses the lead's neutral `isReadOnly(identity)` and
`markFrameUnknown(originalObservation)` APIs after an unsupported fulfilled
call. The generic synchronous invocation algorithm is unchanged. The next
asynchronous boundary flushes the retained terminal observation. Neither an
original method name nor a returned success value grants purity.

`Policies.isPure/isFrame(receiver: unknown, originalCallback)` expose only
membership in the owning original receiver/lexical tables. A supplied managed
receipt grants neither Core role. B consumes that distinction when forwarding
private Core callback context.

Additional observed validation before the latest source boundary:

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/invoke.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/start-state.test.ts`
  -> **2 files, 7/7 passed**, 31.43 seconds. The held sink commit preserves
  the original receiver/tuple, copied receipts and actual throws do not clear,
  and an unsupported fulfilled write blocks a fresh ordinary Root and reopened
  authority before a second write.
- Narrow strict immediately before the sink/session regressions: **31 roots,
  5,042 modules, 0 diagnostics**.
- A later scoped snapshot caught new test statement packing and a queued sink
  catch represented as a void tail. Those were corrected with separate
  statements and explicit fulfilled/rejected sink outcomes. Its three strict
  diagnostics were the writer's active ProjectLedger self-reference inference;
  that owner has supplied explicit truthful return/option types.

The current acceptance and remaining integration limit are recorded below.

## Final callback-owner handoff

The actual original callback policy authority moved to
`runtime/execution-observation/policies/{registry,index}.ts` as
`ExecutionCallbackPolicies`. The old Studio policy leaf is an exact named
alias, with one shared set of private maps. The four original managed-policy
tests moved unchanged to the neutral owner's tests; an additional Studio test
proves alias/authority identity. The lead owns the subsequent internal
`isOwningFrame` spelling correction and parent export.

Whole authority invocation, partial invocation, deferred finish and standalone
Source-bound offline choice now apply the same owner rule: an unmanaged
fulfilled callback preserves its first value but becomes terminal unknown and
flushes before return. Managed Core frames retain their genuine unverified/
pending/recheck semantics. Standalone choice prepares the original Root/tool
handoff before implementation and cannot escape through an unrelated ordinary
Root or independent reopened owner.

`candidateTrialSuppressesWrites` belongs at the `candidate-trials` feature
root. It uses original private mode bindings and remains suppressive after
lease loss; model flags or copied objects supply no mode. It grants no
execution or completion. A new post-result policy path permits only the
ongoing real trial's exact registered no-direct callback to run without a new
entry. Managed/effectful writers still refuse after unknown. Start/reset/new
checkout admission is unchanged, and the first execution-failed result remains
available for diagnosis.

The original fixture start/reset/choice callbacks that only count calls or
return fixed data now have explicit original no-direct declarations. Actual
live callbacks remain unsupported where intended. No action, start, reset,
cache, replay, promotion or first-result oracle was weakened.

Observed validation, all current t843 source and provider-free:

- Exact seven-file ledger/reset/observation compatibility selection:
  **151/151 passed**, 43.43 seconds. Paths are
  `reset-observation/tests/{invoke,finish,start-state}.test.ts`,
  `site-reset/tests/{ledger,project-reset,trial-witness}.test.ts` and
  `trial-defaults/tests/before-trial.test.ts` under `flow-bootstrap`.
- Manual owner boundary selection:
  `candidate-trials/authority/tests/source.test.ts` **7 passed**,
  `candidate-trials/partial/tests/observe.test.ts` **2 passed**, and
  `reset-observation/tests/finish.test.ts` **2 passed**. This includes an actual
  SQL-backed write, unrelated ordinary-entry denial and an independent pool
  reopen with zero second write. Its initially failing partial admission
  fixtures were corrected as described above and their **3 cases passed** in
  the following continuation selection.
- The continuation selection also passed standalone choice **2**, suppression
  **1**, pure post-result/refused metadata **1**, and required-engine **2**.
  Its four cache/readonly fixture failures were then corrected without any
  production relaxation and validated by the following exact final command:

```text
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/candidate-trials/authority/tests/cached.test.ts src/programs/automation-studio/runtime/candidate-trials/partial/tests/read-only.test.ts src/runtime/execution-observation/policies/tests/registry.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/policies.test.ts
-> exit0; 4 files, 14/14 tests passed; 82.06 seconds.
node .fluxiq/refactor/before-trial-producer/typecheck.cjs
-> exit0; 45 exact roots, 5,073 modules, 0 errors.
node .fluxiq/refactor/before-trial-producer/structure.mjs
-> exit0; 17 rules, 0 failures, 11 advisory warnings, 0 baselines.
node .fluxiq/refactor/before-trial-producer/whitespace.cjs
-> exit0; 52 owned files, 0 issues.
```

All worker readers ended and source/test freeze was explicitly reported to the
lead and peers. No package-wide check/build/suite, provider, browser, git,
baseline or user-data operation was run. The lead's actual full Service case
still needs composed acceptance; this worker does not claim its first or
second builder oracle passing from leaf tests. The following shared-context
migration is separately authorized and reported in
`framework-observation-migration.md`.

The user's panel-only requirement remains binding: the remaining candidate,
restoration, authoring, verification and project-persistence authorities must
leave Studio. The completed callback closure is not a permanent ownership
exception. Exact next cuts are in `framework-trial-migration-plan.md`.
