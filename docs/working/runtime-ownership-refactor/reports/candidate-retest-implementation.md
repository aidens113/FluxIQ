# Candidate reentry implementation

Outcome: Done for the whole-candidate source-freeze checkpoint. SOURCE FROZEN
for this checkpoint. The lead has separately authorized the following bounded
partial-trial continuation; that work is listed below and is not claimed here.

## Implemented ownership and behavior

- `runtime/agents/gates/reentry/**` owns original completed-proof admission,
  exact scope/gate/request/generation/ordinal binding, one-use permit consumption,
  revocation and disposal. It imports no Studio code.
- Studio `runtime/candidate-trials/{authority,contracts,mode,reentry,observation}/**`
  owns real candidate checkout, the early configured source, private per-port
  authorities, original invocation companions, restricted cached/offline leases
  and the candidate collaborator consumed by ordinary admission.
- `AutomationStudioCandidateTrialSource` registers once before exploration.
  Later `.bind(modeOwner)` calls create private authorities without touching
  A1 registration. Source key and trial series stay stable across candidate ids,
  revisions, modes, gates and wrappers on the persisted Flow continuation.
- The actual candidate port checks out and removes its original retained
  unjudged evidence before awaits. Prepared starts belong to that checkout.
  Foreign, spent, lost or changed-environment checkouts refuse; a selected
  read-only checkout never becomes a live run.
- The candidate gate reserves before start/reset/port work, preserves synchronous
  reset-policy calls, and observes original callbacks with their original
  receivers. Before-trial filtering still remembers ids per original reset.
  Actual counted valid completions supply a monotonic ordinal across revisions.
  Refusal, invalid result, refund, abort, limit and repeated-failure closure mint
  no new credit.
- Normal calls and actual stall recovery use the same ordinary admission helper.
  A private credit can lift only this gate's exact stale repeat/memo result after
  offering, withdrawal, deadline and limit checks. Prior-node members receive no
  candidate credit. A stall announcement is published only after its call passes
  admission. The strict ordinary retry parser is unchanged.
- Whole project wrappers forward the exact source, authority and observation
  companions. The actual graph-options spread adding referenceNow explicitly
  inherits B's private observation; the environment transform retains B's own
  inheritance. No model-visible capability/property was added.

The two temporary candidate/reentry.ts and candidate/trial-authority.ts aliases
were new during this uncommitted unit, had no historical/public caller and were
removed once all imports targeted the canonical feature. This restored the old
candidate and tests directories to 25 files each. New tests live beside the new
authority. No old public trial symbol or request/result wire shape was renamed.

## Actual source and callback contract

`candidate-trials/authority/index.ts` exports
`AutomationStudioCandidateTrialSource`. Its constructor takes
`{scope, consumer, seriesKey, callbacks, automation?}`; it implements the shared
`ConfiguredExecutionSource`, with its real original origin/admission/evidence
registries. Register and connect the complete owner cohort before any reserve.
The candidate source delegates to callbacks.owner; that callback source delegates
to itself and the actual engine/native/output/hook owners used by the build.

Root's common assembly is now `runtime/build-execution/create.ts`.
Bind the resulting shared source privately with:

```ts
bindTrialExecutionSource(actualTrialEnvironment, sharedSource);
```

The actual environment and whole-ports factories inherit this companion.
Candidate port creation obtains it and binds its original mode owner. Project
function wrappers inherit the same row. No late A1 registration is required.

`TrialExecutionObservation` is only an existing admitted parent plus its actual
connected callback/automation sources. Its bind/inherit helpers operate on
original objects and never create a scope, grant or partial/whole candidate DTO.

Actual callbacks run through B's neutral ExecutionObservationSource using the
original method, receiver and pinned argument tuple. Source-owned original
invocation tokens determine completion; A1/SQL independently verifies the child
frontier. Unsupported first callbacks preserve their result unverified.
Canonical detached execution is eligible as an orchestration frame only when
the actual automation observation exists. Custom execute overrides remain
unverified unless their real owner adapts them. Callback registration is
idempotent for each original receiver/method/lease.

## Read-only diagnosis and promotion

A cached judgment uses a distinct canonical rejudge callback and the exact
original retained evidence. It makes no committing reservation, Flow call,
start hook or reset call even when live history is pending. Private restricted
credit pre-pins that same read-only target before lifting a loop refusal.
Cache/lease loss refuses; it cannot release a live tool allowance.

Read-only judgment never clears live coverage or mints live credit. A cached
yes may stand only when this same source authenticated the exact retained run's
live coverage and current inspection remains clear. Pending/unverified cached
yes is diagnostic, cannot complete/promote, and leaves the original durable
block unchanged.

The offline-first factory also owns a distinct raw offline-only runner. The
public offlineFirst choice function remains uncredentialed. The raw runner
pins the actual eligible trace, candidate receipt and original execution
collaborators; its one-use lease is linked by a private original-input companion
to the real matcher, environment, session and scoped lease when they attach.

Raw offline execution is unavailable to the new authority by default. The
actual owner must explicitly register its original runner receiver/method with
B's no_direct_effects contract, truthfully covering all execution collaborators:

```ts
const original = trialOfflineRunner(actualPorts);
bindTrialOfflineRunnerContract(actualPorts, callbacks, {
  receiver: original.runner,
  callback: original.runner.run,
  contract: "no_direct_effects"
});
```

A replay/environment label is insufficient. There is no universal noncommitting
Flow mode in B; arbitrary custom native/output collaborators are not certified
by matcher presence alone. The explicit owner contract is checked against the
original method and stable collaborator descriptors. Changed, foreign, missing
or spent leases refuse. During the actual raw callback, scoped delegation is
private to its original request and authenticated active offline checkout;
it expires in finally and cannot suppress observation for a live/cached
checkout. Offline diagnosis creates no A1 entry/completion or promotion.

## Verification

All commands ran only in current t843 Core against source. No Core build,
whole-package check, whole suite, provider, browser/panel, downstream source,
original checkout, git or baseline mutation was performed.

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/agents/gates/reentry src/programs/automation-studio/runtime/candidate-trials src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/trial-gate.test.ts src/programs/automation-studio/runtime/flow-bootstrap/trial-defaults/tests/before-trial.test.ts src/programs/automation-studio/runtime/service/candidate-trial/tests/rejudge.test.ts src/programs/automation-studio/runtime/service/candidate-trial/tests/prepared-start.test.ts src/programs/automation-studio/runtime/service/candidate-trial/tests/judging-fits.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/stall-retest.test.ts src/programs/automation-studio/runtime/llm/prior-nodes/tests/tool-admission.test.ts src/programs/automation-studio/runtime/service/offline-first/tests/whole.test.ts src/programs/automation-studio/runtime/service/offline-first/tests/whole-read-only.test.ts
-> Exit0; 14 files, 92 tests passed; 41.91s.

pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/candidate-trials/authority/tests/configured-source.test.ts src/programs/automation-studio/runtime/candidate-trials/authority/tests/entrances.test.ts src/programs/automation-studio/runtime/flow-bootstrap/trial-defaults/tests/before-trial.test.ts
-> After canonical-barrel import corrections: exit0; 3 files, 9 tests passed; 32.23s.

node --max-old-space-size=4096 .fluxiq/refactor/candidate-retest/typecheck.cjs
-> Final: 118 owned source/test files, 0 strict errors.

node .fluxiq/refactor/candidate-retest/structure.mjs
-> Final: 14 selected structural rules, 0 failures, 14 advisory warnings,
   53 unchanged existing baselines; no baseline mutation.
```

The original three positive retest oracles remain unchanged: exact [1,1] calls,
original transient feedback/retestsLeft2, final yes and successful completion.
Their controlled original no-dispatch callbacks now produce real A1 child/root
completion, and the cases additionally assert clear coverage and four actual
callback entries. Existing max-three, repeated-same-failure, cache evidence,
reset-default, affordability, metadata and replay/privacy assertions pass.

New SQL tests execute a real isolated counter callback that increments then
throws/loses acknowledgement. Same input, changed input, a real newly validated
revision, new gate, later bound port and independent reopened pool all keep the
counter at1 and reset at0. Actual normal and stall authoring-loop entrances
also make zero second committing calls. Late binding is tested after the actual
A1 registration_closed fence.

Pending-cache tests run the real retained judge while persistent history stays
pending; only inspection reads occur, action/start counts stay1, reset stays0,
and a yes cannot promote. Actual checkout eviction refuses without fallback.
Raw offline acceptance uses the real scoped trace matcher and controlled
gateway/runner collaborators: no second live command, no local dispatch,
start1/reset0, unchanged pending history, no reservation and no promotion.
Unsupported owner contracts, copied/spent leases and changed collaborators
refuse. The original public offline-first foreign-source oracle is unchanged.

Intermediate tests exposed missing same-owner delegation, projected offered
tools, a metadata-only fixture change that correctly did not make a new
candidate, and accidental coupling between private diagnostic sources and the
old public offline-first source list. These were corrected without weakening
any original assertion. The actual fixture now changes a validated parameter;
private/public source catalogs retain their separate intended semantics.

The advisory warnings concern existing large coordinators/tests and directory
counts. New production leaves are below the line limit; candidate gate is793
lines and evidence-loop800. No import/depth/export/cycle/packing exception or
baseline transfer was introduced. Ignored evidence and scripts are under
`.fluxiq/refactor/candidate-retest/`.

## Handoff and next bounded unit

Whole-candidate SOURCE FROZEN. Root remains responsible for independent
integration verification, public exports/documentation and normal library/
built-package acceptance after all source owners settle. Fully configured
real engine/native/output cohort closure is not claimed from the controlled
no-dispatch fixture alone.

The lead explicitly authorized a following partial unit: the real
flow-bootstrap/subflow-candidate/{subflow-trial-gate,builder-loop}.ts,
candidate-trials/partial/**, project-build/subflow-trials.ts and
subflow-trial/{start,run,port,from-step}.ts copy seams and immediate tests.
No partial source edit has been made at this checkpoint. It must validate
actual partial scope/proposal contracts, admit before reset/start on this same
early configured source/series, and forward an existing admitted parent as a
child rather than creating a nested reservation. It will reuse the newly
available neutral invokeExecutionCallbackRoot lifecycle helper and original
prepared-context binder; it must not duplicate that lifecycle or fabricate a
whole candidate/Flow context.

## Partial continuation: current implementation and verification

The continuation above is now implemented. Its final service compatibility
checkpoint is still active; the previously accepted whole-candidate checkpoint
remains recorded above. No whole-package build/check, provider, browser or git
command was run by this worker.

### Actual admission and original-parent propagation

- `candidate-trials/partial/**` owns the real partial request, configured-source
  lookup, original observation companion, single-flight boundary and a genuine
  retained-evidence checkout. It declares no whole-candidate DTO and registers
  no additional A1 source.
- `PartialTrialAdmission.run(actualRequest, actualTypedCall, fromStep?)` uses
  the already configured candidate source and the frozen neutral
  `invokeExecutionCallbackRoot`. Its scope/proposal and abort checks precede
  admission. An actual admitted parent enters a callback child; no nested
  reservation or caller-root completion occurs.
- Source-bound canonical partial and from-step ports also protect their direct
  entry. Bare `prepareStart` cannot manufacture a full proposal, so it refuses
  before the hook when no original admitted context exists. Legacy unbound
  calls retain their behavior. Prepared starts are retained only for the
  original reservation, preventing a later Root from consuming an earlier
  Root's start.
- The builder loop, project wrapper, canonical port/start/run/from-step seams
  and the dispatcher's actual `asked` wrapper forward original private
  companions. The dispatch wrapper was a real additional loss: without its
  source, the offline choice consumed the first Root and the actual trial was
  correctly refused as a second unverified Root.
- `CandidateTrialSource.unverified(root, originalOrigin, completionDigest)`
  emits a real source-owned `returned_unverified` fact. Completion is never
  inferred from a verdict, reason, missing acts or page result.

### Engine ancestry and option identity

The actual native counter regression found missing private bindings in the
three detached verification files and Studio's `composite-executor.ts`.
Those option copies now preserve the original observer/run proof/retry series.
The actual execute target and tuple are created before entry. The prepared
binder attaches only the private observation to that original target after
durable callback entry; the engine is its real descendant.

Canonical Flow-run callback contracts now require an original observed
descendant from the configured automation owner, using the lead's neutral
`frameCompletion(handle, requiredDescendantOwner?)`. Source presence, an empty
frontier, capture-only callbacks and sibling engine frames cannot certify a
Flow invocation. Genuine no-direct-effects callbacks keep their own contracts.

The same four gated/direct partial/from-step native tests now pass, including
actual `automation.engine` terminal-unknown/interrupted facts, counter 1,
pending coverage and refusal after a real changed proposal. The source facts
are asserted; no wrapper result is used as proof.

The exact intrinsic `automationStudioClassifyLegacyStepAct` is now registered
lexically at its owning compatibility module. Its inspected body reads only
node data and calls the control-word parser/regex. A same-named replacement
does not inherit that registration. The lead has retained its separate R8
ownership migration requirement; this change alters no wording or parser.

### Read-only diagnosis and public choices

- A partial read-only owner pins an original retained lease and supplies a
  distinct diagnosis callback. Its original pin/current/run methods must
  already have real no-direct-effects registrations; binding the owner itself
  grants no callback contract.
- Missing, foreign, evicted, spent or mutated ownership refuses without live
  fallback. Repeated legitimate diagnosis is idempotently registered against
  the same original receiver/method/lease. It changes no A1 history and runs
  no start, reset or live Flow. A direct canonical port also resolves this
  private route before its live implementation.
- A public `offlineFirst` choice is not such a credential. Whole/project
  choices forward an existing original parent or reserve the same configured
  trial series before an unknown actual callback. Unverified return/error
  remains unverified/pending. A genuinely pinned cached whole rejudge skips
  the public choice before calling it and still makes zero new reserve,
  enter, start, reset or live dispatch calls.
- Whole canonical `.port`/bare `.prepareStart` already refused unadmitted
  source-bound calls through `ModeOwner.run/start` before automatic checkout
  or hook. A new direct consumer regression proves zero start/native calls.

### Observed results and remaining service contract boundary

- Closest source selection: **35 files, 277/278 passed, 84.56 seconds**.
  The exact selectors are retained in ignored
  `.fluxiq/refactor/candidate-retest/partial-final-selection.txt`; the observed
  output is `partial-final-tests.log`. This included the original 31 whole
  gate cases, actual SQL normal/stall/counter/reopen cases, the partial
  mechanism, cache/offline, detached runners and project compatibility.
- Native binding/ancestry subject after the Studio wrapper correction:
  **1 file, 4/4 passed, 53.58 seconds**, `partial-native-tests.log`.
- Isolated strict at that stable point: **162 owned files, 0 errors**.
- Scoped fourteen-rule audit at that point: **0 failures, 17 advisory
  warnings, 58 unchanged historical baselines**. No baseline was raised or
  transferred. The later dispatch/intrinsic/fixture additions still need the
  final scoped probe after temporary diagnostics are removed.
- The single legacy project-reset consumer first failed before any trial
  step with real `execution_admission.retest_unverified`. After preserving
  the dispatch wrapper's companion, the unchanged test passes its first YES,
  stillThere/leftOnSite, exact undos, loaded start and dependent-entry oracles.
  Its second trial remains refused while the first Root is unverified.
- Exact persisted unverified owners before the managed fixture update were
  `runtime.native`, `automation.engine` and `studio.build.callbacks`, then
  `candidate.trial.flow.generated`. Original operation UUID correlation
  identified `chooseOffline`, `offlineFirst`, `beforeTrial`, the enclosing
  canonical run callbacks and engine frames. No result-status purity was
  inferred.
- The lead added the real native registration seam:
  `service.bindNativeNodeRuntime(runtime, existingIdentity?, registrations?)`.
  The fixture now gives each actual original implementation an exact package/
  definition registration and a one-use original-result receipt, minted only
  after synchronous cart/page mutations finish. The receipt digest binds
  actual before/after state. Unknown/copied/rejected outcomes have no receipt.
  This reduced actual `runtime.native` unverified facts from **2 to 0**;
  fixture writes are `settled`, never `no_direct_effects`.
- The real service scope owner in `service/execution-admission/binding.ts`
  intentionally supplies an **unverified baseline** by default. At discovery
  the controller hardcoded that owner, so even complete callback closure
  could not make the second service trial clear. The lead has now released
  a genuine constructor-only attestor seam; the default remains unverified.
  The remaining exact beforeTrial/offline callback contracts are being
  inspected independently of this baseline.

Temporary fixed-fixture diagnostic spies printed only source/function/fact
metadata into ignored logs and have now been removed. The original yes, cart,
undo and stillThere assertions remain unchanged.

### Authenticated isolated shop and remaining callback closure

The lead and storage worker have frozen `ExecutionScopeAttestor.attest` and
`ExecutionScopeAttestation`, with `executionScopeAttestor` a service
constructor option. The fixture's original `ShopScopeOwner` retains its actual
in-memory shop until service cleanup, owns one unique stable resource key,
and issues original proofs through a private WeakMap. It preserves the actual
persisted project, owner, continuation and coverage epoch; it substitutes only
its owned resource key. Copied/foreign/closed proofs return null. It does not
change SQL history, choose a new epoch or attest from a reset/model reply.

The fixture now supplies this original owner and the previously described
one-use native completion registrations. New focused assertions reject
foreign/copied/rejected native outcomes without a receipt. These assertions,
the intrinsic classifier regression, and the updated service consumer await
the storage-owner and options-migration source freeze; no runtime command was
launched during that hold.

Static inspection identifies distinct remaining boundaries, without granting
purity by name:

- The actual project builder recreates its harness in
  `service/project-build/brief-ports.ts:276`, then uses its execute callback at
  line280. The top-level service wrapper does not wrap that new harness.
  The saved actual trace has zero `studio.build.tools` roots. Exploration in
  this path therefore needs original ordinary-root/producer integration.
- Project reset's actual `beforeTrial` invokes its supplied checks and can
  navigate via `lookAt`/`compare`; it is effect capable and remains unknown
  without managed child coverage.
- Partial gate sync policy callbacks (`admissionPredecessors`, `admit`,
  `weighed`, `trialRan`) currently use the neutral sync observer but original
  Core factory contracts are not registered. Their injected methods must be
  inspected and observed, rather than granting all properties those names.
- Offline factories currently read `liveRecords` before the installation
  absence check. A distinct callback that returns the literal disabled answer
  before touching injected collaborators would be a coherent pure cut; the
  public live-or-cache callback is not itself a read-only credential.

The closer follow-up checks now observed:

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/project-build/tests/project-build-trial-reset.test.ts -t shop`
  -> **2 passed, 1 deliberately unselected**, 81.82 seconds. This checks the
  new original-owner and receipt-negative cases; it does not claim the old
  second-trial consumer now passes.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/compatibility/tests/classifier.test.ts`
  -> **2/2 passed**, 44.06 seconds. The initial negative fixture's lexical
  name was rewritten by the bundler; explicitly assigning the forged
  function's name preserves the intended same-name/foreign-identity oracle.
- The combined classifier/dispatch run observed **9/9 dispatch cases passed**
  and the actual compute-only engine case passed; its one negative fixture
  name failure was corrected and rerun in the command above.
- `node .fluxiq/refactor/candidate-retest/typecheck.cjs` -> **167 owned
  source/test files, 0 strict errors**, including the fixture and intrinsic
  additions.
- `node .fluxiq/refactor/candidate-retest/structure.mjs` -> **0 failures,
  17 advisory warnings, 58 unchanged historical baselines** across the
  fourteen scoped rules. No baseline mutation.

`togglesWritten.sync()` is itself effect capable: the actual writer queues
`record.records.recordToggle` calls, and `flushed()` is its real awaited
completion boundary. The outer project offline wrapper therefore cannot be
registered as an empty or pure frame solely because its inner disabled
decision is literal. Its real writer/record owner needs coverage separately.

### Released literal offline cut

`service/offline-first/disabled.ts` now owns one module-private zero-argument
`disabledAnswer`. Its body returns only the unchanged `offline_trials_off`
literal. The exported focused owner accepts an original configured Source and
signal, never a caller callback. It registers only that original literal
function once per callback Source, invokes it through existing
`invokeReadOnly`, and creates no reservation, entry, completion credit or Flow
lease. The unbound path invokes the same original function. Abort still
refuses first.

Both whole and subflow factories select this path before reading injected
`liveRecords` or ports. Installed subflow choices now use the same existing
`observeCandidateTrialChoice` boundary as whole choices; a real original
parent forwards a child, while a direct source-bound unknown callback must
reserve the same continuation before invocation. Legacy unbound behavior is
retained. The outer project's toggle writer is deliberately not given a
contract by this cut.

The new immediate test uses an actual entered counter-then-throw continuation
and fully constructed offline harnesses with throwing collaborator proxies.
It exercises both disabled factories repeatedly while history is pending,
checks unchanged history and zero live calls, and rejects the installed
callback before its injected reader.

Observed follow-up validation:

- Four closest files (`offline-first/tests/{disabled,whole,subflow,whole-read-only}.test.ts`):
  existing whole **10/10**, subflow **3/3**, read-only **3/3** and the pending
  disabled case passed. One new assertion incorrectly expected a generic
  admission error; the real memory store correctly refused with `store.blocked`.
  The exact expected storage error was corrected; no behavioral assertion
  or original oracle changed.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/offline-first/tests/disabled.test.ts src/programs/automation-studio/runtime/candidate-trials/authority/tests/cached.test.ts`
  -> **2 files, 4/4 passed**, 46.71 seconds. The two original genuine cached
  rejudge oracles remain intact, including zero public-choice/live calls.
- Final strict probe initially caught two missing required
  `installation: undefined` fields in the new disabled test's inputs; those
  inputs now express the existing actual contract explicitly.
- `node .fluxiq/refactor/candidate-retest/typecheck.cjs` -> **170 owned files,
  0 strict errors** after that exact fixture correction.
- `node .fluxiq/refactor/candidate-retest/structure.mjs` -> **0 failures,
  17 advisory warnings, 58 unchanged baselines**.
- `node .fluxiq/refactor/candidate-retest/whitespace.cjs` -> **170 owned files,
  0 trailing-whitespace lines**; no unrelated source was rewritten.

### Exact next before-trial/start-state closure

The smallest complete follow-on crosses these real seams; moving or tagging
the outer callback alone cannot close it:

1. `flow-bootstrap/trial-defaults/before-trial.ts`: in the actual prepared
   binder, relay the original callback child onto the unique options object
   privately. The stored request/reset data and original receiver remain
   unchanged. The whole and partial branches both use the existing original
   observation lookup; no current/global execution slot is needed.
2. `service/project-build/brief-ports.ts`: the `reset.beforeTrial` arrow
   delegates to a distinct `buildReset.beforeTrial`, and its `checks` factory
   creates the compare/compareAt/lookAt closures. Observe each original
   receiver/method and propagate the original child through that factory.
   Only the exact factory body that constructs closures without invoking
   them qualifies for an intrinsic no-direct contract. The delegated reset
   and actual look/compare calls remain managed frames.
3. `flow-bootstrap/site-reset/project-reset.ts`: beforeTrial invokes supplied
   checks, ledger decisions and session looks. Its managed contract must
   derive from original observed child closure; never from `admit`, `moved`
   or `startedWith`. All supplied callbacks must be observed, including the
   sync factory and metadata methods.
4. `flow-bootstrap/site-reset/start-check.ts`: `capture`, `read`, and
   `compare` directly invoke the original `binding.startState`; private
   `arrive` invokes the original executeTool. These are the actual producer
   seams. Carry the admitted child privately on each newly constructed call
   object and observe the exact original host callback. Its raw result/error
   goes to its real trusted completion owner before any result mapping.
5. The actual synthetic `binding.startState` only reads its owned synchronous
   shop and is a valid original no-direct registration. Its executeTool
   performs direct cart/page mutations independently of NativeRuntime, so it
   requires its own one-use original-result receipt after actual effects.
   Existing native registrations cover detached Flow execution only. Reuse
   the lead's common raw-binding producer contract; do not introduce a second
   DTO or infer from executeTool's effect/status fields.

The neutral sync observer currently closes only exact no-direct contracts.
Effect-capable sync policy or queued persistence callbacks therefore need a
truthful owner/completion seam, or exact inspected no-direct originals;
managed-frame tagging alone cannot close them. The lead owns that neutral
protocol decision and common ordinary-tool producer integration. Required
acceptance remains the unchanged service YES/stillThere/cart/undo sequence,
plus actual counter-throw/lost-ACK pending facts and zero second send.

### Partial source handoff

**SOURCE FROZEN for the C partial/literal/fixture/intrinsic unit.** All worker
processes have stopped. The complete original project-reset consumer is not
claimed passing: its last observed failure was its second trial after the
first YES and unchanged world/reset oracles succeeded. It was deliberately
not rerun after the isolated owner/literal updates while the effect-capable
beforeTrial, ordinary tool and queued writer contracts remain open. The
exact final integration selector is
`src/programs/automation-studio/runtime/service/project-build/tests/project-build-trial-reset.test.ts`.
The next closed producer unit above must pass its original full sequence.

No whole-package check/build/suite, provider, browser, panel, baseline,
shared-doc or git operation was performed by this worker. The lead retains
common producer/source and public integration ownership; the report records
mechanism verification separately from that outstanding integration.
