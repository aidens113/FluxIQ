# D3 trusted settled safety implementation

Source status: FROZEN. No tests, typecheck, audit, build, browser, provider or git commands were run; acceptance belongs to the lead.

## Private assessment boundary

Added `runtime/action-permissions/assessment-observation/{types,context,observation,effect,index}.ts`; the feature is deliberately absent from action-permissions/runtime/SDK public barrels. It imports only node effect contracts and action-permission types, never llm/bootstrap/service.

`ActionPermissionGate.checkFor` begins a ticket before declaration parsing, computes its full effective floor from the actual parsed declaration plus actual permission projection, invokes private deny-only preflight before any early permit/instruction read/request, and settles every actual verdict before the capped500 history branch. The no-run denied helper follows the same order with no invented primary source.

The normalizer preserves commit/[] independently of model classes; unions effective trusted/model consequences; preserves explicit state repeat safety; treats legacy mutate/[] without proof as unsafe state; disregards classes for truthful observations exactly as the existing projection does. No result JSON or history entry creates a floor.

Registered-symbol ALS transports private source refs and opaque assessment tokens across bundled Core copies. Nested scopes fan out to all ancestor observers/vetoes; concurrent scopes isolate. D0 aggregates every actual completed assessment. Pending/thrown/malformed/duplicate/denied checks poison proof, and no-check/auxiliary-only calls do not acquire primary proof. Closed D0 callbacks ignore late finalizers.

## D0 capture, execution and fresh receipts

Private records now carry optional nonenumerable deeply owned/frozen `observedEffect`. It is OMITTED unless a matching actual permitted primary `{kind:exploration_step,id:request.toolId,ref:request.callId}` and all completed auxiliary checks establish proof. The public CaptureSnapshot and model input shapes are unchanged.

Capture still surrounds the same whole wrapped executor, and existing actual-dispatch/outer positive settlement checks remain mandatory. Capture never vetoes ordinary permission. Actual commit evidence may remain on a successful receipt record, but cannot be admitted for repetition.

Execute refuses missing/unsafe original observed proof before invoking the executor. Its private deny-only scope rejects unknown/unsafe/stronger actual floors before the permission result can permit an action or open an ask. Strength compares the accepted class envelope, effective consequence subset and explicit state repeat promise. Pending earlier checks are distinguished from the currently assessing token. Ordinary permission still decides everything the scope does not veto.

Selected.consume additionally requires actual fresh-call primary settlement and a safe aggregate within the accepted envelope before capsule acknowledgement. Missing proof refuses without fallback. Consume acknowledges selection only, and does not establish main dispatch or a receipt.

Per root's `d3-dispatch-contract.md` freeze, selected execution access now has optional host-only `reportDispatch(capsule,dispatch)`; the actual adapter producer must report its own fresh final-lowering attempts. D0 validates active adapter owner/generation/value/capsule/scope, prior consumption, selected final actual receipt, unique attempt/receipt objects, and freshness against this provenance instance's original captures and accepted reports. This does not grant a new original/candidate.

Private execute outcomes expose hidden `main:unacted|unproven|receipt`. Only an accepted fresh actual report yields receipt. A Core refusal before executor invocation, or private preflight/consume hold before capsule authorization with no report attempt, yields unacted. A consumed call without a fresh report remains unproven. Failed/unacted/uncertain/unknown dispatch outcomes WITH actual receipts remain receipt-backed and force unproven/stop; they are never erased for failing success eligibility.

Root additionally approved PRIVATE `kind:threw` with the original hidden error object, plus hidden optional `dispatch` on returned/unproven/threw outcomes. Actual returned results, accepted attempts and receipt identities survive later veto/refusal/throw. Capture throws retain their previous propagation behavior. Nothing raw enters public summaries.

Extracted the existing dispatch reader from snapshot.ts into cohesive `rerun-provenance/dispatch.ts`. Original capture retains its strict success-only mode; execution accounting can preserve actual unsuccessful/uncertain receipts.

## Shared safety policy and limits

Added browser-safe `nodes/action-effect/repeat-safe.ts` + owning barrel export. C's existing `node-reruns/prior-call.ts` EffectSafe function now delegates to it with identical semantics. D0 uses the same classifier without a D0-to-C dependency/cycle. No other C/D2/service/Down/public SDK barrel source was edited.

Trusted source refs prove wrapper ownership, not a cryptographic gate-to-dispatch-selected link. Freshness is enforced within the owning provenance instance; receipt origin beyond that is the trusted producer's actual attempt observer, not unsupported global receipt authentication.

Unsupported/no-permission main paths remain ineligible. In the inspected Down frozen non-observation path, permission precedes consume and main dispatch. No global claim of zero auxiliary commands follows from a held main. A producer acting before checking/consuming cannot be made safe by post-settlement capture.

A report first presented after scope loss is rejected under the frozen active-scope contract; main remains unproven and the actual outer result is retained. An already accepted report survives later scope loss. No receipt-only exception to scope validation was silently introduced.

## Authored acceptance specimens

- `action-permissions/tests/assessment-observation.test.ts`: full normalized floors, union/disregarded classes, >500 history, denied helper, pre-request deny-only order, pending parser failure, fail-closed callback, nested/concurrent/cross-copy transport.
- `rerun-provenance/tests/settled-safety.test.ts`: immutable/absent actual proof, unsafe canonical mismatch, no-primary/JSON forgery, commit then safe observations, declined-then-granted, swallowed thrown/pending/duplicate checks, nesting/concurrency, late finalizer, predispatch/no-ask veto, consume hold, consume-without-report unknown, fresh unsuccessful receipts, old/foreign/reused/late reports, post-receipt auxiliary veto.
- Updated original provenance fixtures/tests to use a real Gate primary assessment and fresh actual report for positive frozen execution, preserve unsuccessful receipts, and assert private execute-threw accounting.
- `nodes/action-effect/tests/repeat-safe.test.ts` covers the extracted shared classifier; C's existing owning tests remain acceptance for unchanged delegation semantics.

Lead selectors (not run):
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/action-permissions/tests/assessment-observation.test.ts src/programs/automation-studio/runtime/llm/rerun-provenance/tests/provenance.test.ts src/programs/automation-studio/runtime/llm/rerun-provenance/tests/settled-safety.test.ts src/programs/automation-studio/nodes/action-effect/tests/repeat-safe.test.ts`
Then existing owning gate/effect/C tests, affected package typecheck and narrow structure audit after all writers freeze. No full sweep or paid calls.

Outcome: Done
Changed: private assessment feature; gate.ts; D0 assessment/dispatch/types/provenance/snapshot and owning tests; generic repeat-safe helper/barrel/tests; C prior-call.ts delegation only; this report
Validation: not run — source-only brief reserves checks to lead
Not verified: compilation/tests/audit, D1 fresh producer hook, D2 consumer integration, browser/runtime behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d3-implementation.md
Notes: Public model/CaptureSnapshot inputs unchanged. Source frozen for lead acceptance; actual receipt preservation and scope limitations stated above.
