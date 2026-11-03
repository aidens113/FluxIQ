# Callback preflight descriptor audit

Status: READ-ONLY COMPLETE; existing C production/tests remain FROZEN. No runtime/compiler/audit/build ran for this report.

Confirmed source findings:
- `engine/automation/execution-admission/internal/coverage.ts` reads remaining options through `record[key]` and host methods through `Reflect.get(host,key)`; neither is descriptor-safe.
- A getter that writes and returns undefined is classified as no callback. A getter returning an already trusted function likewise hides the getter's own effect. No getter invocation/receipt is observed.
- `internal/driver.ts.prepare` has durably entered the kernel before coverage, but has not invoked its body. The getter therefore runs outside an observed getter-method call; a clean body/frontier can later close despite the hidden write.
- The new `options/record-batch.ts` guard protects ONLY onRecordBatch, including inherited accessors. It supplies no protection for the remaining keys or the hostRuntime container property.
- `integration/graph-options.ts` builds a plain outer options object but assigns the ORIGINAL input.hostRuntime reference. Prototype/own getters on that host survive; the host is neither normalized nor descriptor-validated.
- The same factory directly reads input fields/native methods. No earlier whole-input descriptor guarantee was found in this named construction path; trusted Core literals are the normal path, not an enforced public constraint.
- `environment/executor-options.ts` and `execution-admission/copy.ts` spread options. Own enumerable getters run before overrides and become plain values, losing their original descriptor provenance. Copying does not make those prior effects safe.
- The existing executor-options getter-order test intentionally preserves this unobserved legacy behavior. An observed-only refusal must leave that branch and its ordering intact.

Concrete finite counterexamples (source-derived, NOT executed):
1. Original observed options: own get now(){writes++;return undefined;}. Coverage executes it, records no unsupported callback, and the subsequent copy may execute it again; compute can finish with no getter child.
2. Original host: inherited get checkFacts(){writes++;return undefined;}, otherwise no callbacks. The original host survives construction; Reflect.get executes it and the same false absence occurs. Returning a trusted original function also does not account for the getter.
3. Install an effectful replacement as Date.now and supply that same function as options.now. The per-call known-clock Set includes CURRENT Date.now, so the replacement borrows native trust; graph-run.ts141/153/158 call now directly.
4. Keep the frozen original live.now arrow but replace Date.now. `runtime/environment/live.ts` delegates dynamically to the replacement; the arrow's frozen identity does not prove its delegate remained native. live.random has the identical Math.random issue.

Clock evidence and existing owner:
- Coverage rereads current Date.now/Math.random while constructing its Set; accessor replacements of global Date/Math or their methods can themselves execute during classification.
- live.ts freezes its outer object, but now/random bodies read mutable globals on EVERY call. scoped.ts's default random does likewise; caller-supplied clocks have no automatic trust.
- `runtime/models/execution/defaults.ts` has the same dynamic now/random bodies, and declares their original wrappers pure. `clock.ts` observes the wrapper/callback; that does not validate the wrapper's mutable native delegate. This is the relevant second consumer, not a new model audit.
- Existing actual descriptor/native identity implementation: `framework/observability/exchange-log/native/functions.ts` captures original Date/now DATA descriptors; `native/invocation.ts` validates original global/method identity and invokes the PINNED function with the original Date receiver.
- Reuse/extract ONLY that Date/now capture+validation/read into a focused shared native clock owner; keep log counters/state in their current owner. Do not import fs/log infrastructure or Models into Engine, and do not copy the algorithm into another owner.
- That inspected owner has no Math.random support; add its original Math/random descriptor identities once if the random bypass is fixed. Model defaults are not a guarded alternative. These snapshots establish bootstrap identity, not sandbox/native-code authenticity.

Smallest truthful fix cut (NOT released/implemented):
- Add one descriptor lookup utility walking own/prototype DATA descriptors; reject accessors without invoking them. Preserve the original host object, function, method receiver and invocation tuple; inherited DATA methods remain supported.
- Use it for every remaining preflight callback slot AND options.hostRuntime itself. Keep clock/direct-untracked preflight; do not blanket-remove presence checks or infer pure from a returned function/value.
- Before an OBSERVED options copy, reject enumerable accessor descriptors on both source and changes; otherwise an unrelated getter can execute during spread before callback classification. Reuse original private binding membership to select this observed branch; no new registry/context or cloned host.
- Verify the first observed construction/copy boundary too: materializing a getter into DATA earlier must not erase its provenance and later count as safe. Legacy unobserved getter evaluation/order stays unchanged.
- Recheck the actual callback read boundary for runtime replacement; data replacement must be observed as the NEW exact pair and cannot inherit old function trust. Refuse accessor replacement through the current entered frame and existing unknown/flush rules.
- Shared native-clock reads use pinned original receiver/function identities or refuse changed/accessor globals before dispatch. Validate at actual reads as well as preflight: a wrapper can outlive the check. Custom clocks require their own original contract; no automatic declarations/receipts.

Proposed exact implementation ownership (Root retains public parents/package/config):
- Engine descriptor unit: execution-admission/options/{descriptor,guard,record-batch,index}.ts; internal/coverage.ts; copy.ts; integration/graph-options.ts; environment/executor-options.ts; kernel/callback/{invoke,sync,unknown}.ts. Reuse the existing record accessor lookup, not a second guard algorithm.
- Native identity unit: new framework/clock/native/{functions,read,index}.ts extracting actual exchange-log/native/{functions,invocation}.ts Date/now identity logic; add Math/random there once. No Source/receipt registry. Log per-operation counters remain unchanged in the log owner.
- Clock caller unit: runtime/environment/{live,scoped}.ts; runtime/models/execution/{defaults,clock}.ts; engine execution-admission/kernel/callback/clock.ts. Observed call owners validate then invoke the ORIGINAL callback synchronously; unobserved behavior stays legacy. Do not import Models into Engine.
- Direct Engine clock sites requiring that single call owner: graph-run.ts; composite/execution.ts; host-state/capture.ts; resume.ts; step-loop/ask-or-park.ts; node-execution/{execution,failure,attempt}.ts. This is an actual source inventory, not a claim every timer/random route is already covered.
- Immediate existing selectors: execution-admission/tests/{producers,copy,record-callback}.test.ts; integration/tests/{graph-options,ports}.test.ts; environment/tests/executor-options.test.ts; runtime/environment/tests/environment.test.ts; runtime/models/execution/tests/clock.test.ts; framework/observability/exchange-log/native/tests/invocation.test.ts.
- New selectors under owning tests/: execution-admission/options/tests/descriptors.test.ts, execution-admission/tests/preflight-descriptors.test.ts and framework/clock/native/tests/read.test.ts. Add observed/unobserved constructor/copy parity to the existing integration/environment subjects above.

Finite named-only acceptance matrix for the follow-up:
- Own and inherited option/host/container getters returning undefined OR a known function: accessor0 before refusal; callback0; pending/reopen refusal under the existing actual entered owner.
- An unrelated enumerable getter on observed source/changes cannot run during copy; repeat on an earlier constructor input to prove no descriptor laundering. Original unobserved getter-order oracle unchanged.
- Legitimate inherited DATA method with private receiver state keeps its exact receiver/tuple and succeeds only with its actual existing contract; host identity unchanged.
- Replace a DATA callback after preparation: new original pair stays unsupported/pending; repeat with accessor replacement and require getter0/persistence0.
- Replace global Date/Math and method DATA/accessor descriptors both before preflight and between preflight/read: replacement0; no borrowed native trust. Unchanged pinned native defaults still work.
- Explicit custom clock counter/throw with absent contract remains unsupported, then exact legitimate owner contract works. Root/Source pending, durable marking failure and reopen assertions remain mandatory; no fresh-scope escape.
- Emit only fixed role/key labels, never callback values, source text, payloads or secrets. No new Source/Bindings/receipt authority; actual getter invocation needs its own owner if support is ever added.

Not verified: these adversarial cases/implementation, Proxy descriptor traps, or whole Core/Down completeness. These are required next fixes, not permanent deferrals. Native DatasetStore completion and clean actual Service positive remain pending separate work.
