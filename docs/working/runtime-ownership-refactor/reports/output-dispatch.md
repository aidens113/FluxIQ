# R3 output dispatch and execution integration

Outcome: Done. SOURCE FROZEN.

## Canonical mechanisms

`runtime/output-dispatch/**` owns the actual IO/runtime transports, effect parsing, confirmation, result/failure/route/actionability/cleared-wait projection, compact metadata, explicit target matching and confidence policy. IO and runtime dependencies are structural method ports. There is no Studio or engine import, including types, and no browser-envelope recognition or implicit matcher.

The three lead-owned preparer contract definitions are unchanged. Preparation receives only a frozen shallow view of the declared action fields, bound domain ID, and registered output definition. Caller parameters/metadata are neither frozen nor mutated. Only returned parameters, diagnostics and resolution are consumed; extra JavaScript identity, action type, confirmation and metadata fields cannot replace the cached original authority. Absent preparation leaves opaque parameters untouched. Registration is checked before preparing or dispatching.

Confirmation is armed before dispatch, preserving synchronous events. Runtime capability fallback still prepares twice in the original order. Command context, signal, reference time, runtime timeout, preferred client/session, withholding and result withholding, metadata key/compaction, custom success routes, reported failures, actionability and cleared waits retain their existing behavior. No optimistic act-effect or retry claim was added.

`runtime/output-dispatch/matching/**` owns generic candidate selection and the exact existing safety defaults/finite override clamp. No-candidates and no-matcher remain distinct and claim no applied confidence floor. Only an explicitly supplied matcher can select; diagnostic/selection data contains the existing score and signal fields, without whole candidate payloads or contribution metadata. The matching directory avoids a new filename-prefix violation while leaving the frozen preparation contracts at their original paths.

`engine/automation/integration/**` owns the actual graph option assembly as `createAutomationGraphOptions`, with `AutomationGraphOptionsInput` and a structural `AutomationNativeExecutionPort`. It uses R2's canonical environment adapter and R1's native port. Runtime modules do not import this engine owner. Ordered capability deduplication, bound-domain authorization, per-call native execution/effect floors/refresh, original host object/receiver, reference time, optional callbacks/parking and live/offline timer/randomness behavior are preserved. Composition reads no host classifier and installs none.

## Explicit Studio composition

- Old `runtime/io-policy.ts` keeps all three public signatures and binds `createAutomationStudioOutputTargetPreparer` before delegating to canonical transport.
- `runtime/output-target/**` retains the single existing legacy target normalizer, output metadata conventions and envelope rewrite. Browser fields remain opaque compatibility data here; no replacement normalizer or web scorer was copied into the canonical runtime. This explicit legacy adapter remains input to R8's domain-port migration.
- Old `service/runtime-session/graph-options.ts` preserves its full legacy IO/runtime/native input types, captures only the bound domain's registered matcher, binds the legacy preparer, and delegates to engine integration. It never substitutes the deprecated neutral native matcher.

No R1/R2 implementation, stable preparer definition, state/contracts package, composites, model normalizer, package exports, parent barrels, `_shared/runtime.ts`, downstream source or audit configuration was edited. The lead owns public exports, parent wiring and downstream migration. Only this t843 worktree was used.

## Tests and observed validation

All **26 original IO tests and four environment option tests** are preserved without relaxing assertions: 18 pure transport/real-store privacy tests moved to canonical dispatch, four environment tests moved to engine integration, and eight Studio target/diagnosis/privacy-flow tests remain at their composition owner. Added tests directly prove opaque pass-through, parameters-only preparation, original output/confirmation identity, confirmation-before-dispatch, explicit refusal/exception, double-preparation fallback order, context/routing/deadline/reference/withholding forwarding, no-matcher/no-candidate separation, exact confidence boundaries/privacy, host receiver identity, dynamic native authorities, explicit Studio binding and per-domain matcher capture.

Final command in `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ`:

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/output-dispatch/tests/transport.test.ts src/runtime/output-dispatch/tests/privacy.test.ts src/runtime/output-dispatch/tests/preparation.test.ts src/runtime/output-dispatch/matching/tests/match.test.ts src/runtime/output-dispatch/tests/source-closure.test.ts src/engine/automation/integration/tests/graph-options.test.ts src/engine/automation/integration/tests/ports.test.ts src/programs/automation-studio/runtime/tests/io-policy.test.ts src/programs/automation-studio/runtime/service/runtime-session/tests/graph-options.test.ts src/programs/automation-studio/runtime/tests/native-node-runtime.test.ts
```

Observed: **10 files, 60 tests passed, 53.94 seconds**. This includes the retained native/graph integration cases and actual `FileRuntimeStore` privacy checks.

- `pnpm.cmd --filter fluxiq exec tsc -p ../../.fluxiq/refactor/tsconfig-output-dispatch.json --pretty false` -> **exit 0**, strict configuration with 46 canonical source/test roots.
- `node .fluxiq/refactor/output-dispatch-structure.mjs` -> **0 scoped findings** across imports, cycles, exported values, casts, naming, directory/file/class budgets, statement packing, test placement and web vocabulary. No baseline changes or remaps.
- The passing source-closure test checks erased relative imports as well as bundled runtime dependencies. Dispatch has no Studio/engine dependency; engine integration has no Studio dependency.
- Earlier unchanged Studio IO/environment checkpoint: **30/30 passed** before test transfer. The initial focused strict probe found only two new test-fixture typing issues, which were corrected; the naming probe required grouping the new matching files. All final checks above passed after those changes.

Not verified by this worker: package-wide typecheck/build/full suites, full legacy declaration integration, downstream public-subpath migration or browser behavior. The lead has started the coordinated package typecheck after this source freeze; its result is not claimed here. No provider calls, paid runs, browser sessions, panel servers, git mutations or agents were started. No validation process from this unit remains in flight.
