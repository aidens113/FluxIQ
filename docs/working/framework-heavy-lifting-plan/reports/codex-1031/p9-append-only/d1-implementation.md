# D1 Down actual-dispatch capture and frozen execution

Source status: **FROZEN** before this report. No tests, builds, audits, git, provider, browser or panel operations run.
Owned Down changes: `domain/src/runtime/llm-evidence/node-run/{run.ts,context.ts}`, new `node-run/frozen-execution/` with owning tests/barrels, `node-run/retries/{dispatch.ts,reacquire.ts}`, `llm-evidence/tools.ts`, and the private scope-options type in `llm-evidence/capture.ts`.
No Core source/public interface, P10 guidance, wire/provider/model source, generated output, baselines, versions or shared working state changed.

## Producer and capsule

Each evidence runtime creates one stable owner/generation and private WeakMap capsule registry. Handle-map changes do not rotate it. Subject objects are interned by actual resource/document/address and element identity or concrete read-query semantics; locator/position and keyed-record text drift do not create a new element subject.
The actual adapter entry value is copied before domain shaping/held restoration, only when Core offers an active capture sink. Invalid/unproven entry copies leave the ordinary path intact.
Capture records canonical catalog definition id/version and actual concrete logical parameters, separate from authored `draft.ranWith`. Extraction reference stamping and check-wait defaults are explicitly lowered into the logical record before constructing its exact dispatch payload; rejected-row sampling remains an explicit producer transformation.
Direct run-node dispatch has no executable node-port/row inputs, so its own effectiveInputs is explicitly `{}`. It never derives inputs from draft/replay/output rows.
`tools.ts` reports the final lowered command by private command-object identity immediately before the owning gateway sends it. Both ordinary and fresh reacquired retry dispatches participate; page looks/effect checks are excluded from main-attempt capture.
Every main attempt has a private identity and actual receipt. The final successful actual attempt is selected. Unknown/uncertain attempts, successful-looking answers carrying failure metadata, synthetic effect-check settlement, incomplete final-lowering observation and invalid refresh cannot publish proof.
Publication happens once on final ordinary success, provisionally; Core alone seals after outer wrappers settle. Capsules retain exact command, scope, source and subject privately and are never added to tool metadata, model JSON or execution results.

## Shared execution and scope

The Core accessor is read before replay/opening/ordinary target or extraction resolution. Active refusal never falls through. A selected capsule must belong to this binding's WeakMap and match current session/project/Flow/build/start-location/reference and exact current definition/version/action.
Selected calls enter the ordinary run continuation after preparation. They use stored semantic parameters plus an existing strong record-aware same-subject identity match against a complete current hidden-inclusive scoped capture. A freshly matched current handle is separate from original public/written parameters and is used only for normal control/layer/acted bookkeeping.
No prior model target or extraction handle is resolved against a replacement store. Concrete query fields/defaults/reference stay fixed even when a new map assigns the old extraction number elsewhere. Query rows remain current data.
Before the selected main dispatch, the adapter validates actual current session/resource/tab/frame/full safe address/document timeOrigin and consumes the exact capsule once. Captures/effect checks stay on that resource. Current permission, origin/shown-address, actionability, retry/effect/uncertainty and ordinary result/evidence postprocessing remain shared.
The existing first-attempt-plus-three-retries policy and same-subject stale-target recovery remain the dispatch implementation. Fresh extraction retries now retain the fixed reference instant instead of dropping it. No second retry loop or unchecked gateway path was introduced.
Observation uses the ordinary capture/result path. Its actual capture response proves initial implicit scope; a selected observation takes a passive current scope guard, consumes its capsule, then makes its ordinary current read under explicit captured scope. Its inspect code remains unchanged.
No navigation/reset/replay prefix, automatic Flow/dataset write or row/output rebinding is introduced.

## Exact capture limitations

Missing positive session/source/tab/frame/full-address/timeOrigin claims remain unproven. Known DOM scope is explicitly pinned only after authoritative capture; unsupported/unproven ordinary calls keep existing dispatch behavior and publish no capsule. Targeted children are captured separately before scope is claimed.
Supported subject kinds are the current page observation, concrete detected extraction READ-QUERY, and an element supported by existing identity recovery. A query is not a claim of stable physical row/container identity: its exact detected concrete template runs in the same document while rows may change.
State-bound targets, record-values/row-bound targets requiring source rebinding, unsupported browser-global operations and missing/ambiguous identity are unproven. Changed document/resource/address or gone/ambiguous element refuses selected execution; query address refresh is not invented.
Current cancellation and permission are operational controls; neither is frozen or cached. Process/binding replacement cannot recover a capsule from JSON.

## Authored acceptance, not executed

`frozen-execution/tests/binding.test.ts`: actual target-map/extraction-map replacement and old-handle reuse, original subject/current handle, fixed query/default/reference, raw adapter entry/canonical alias, forged/foreign/refused capsules, changed scope/gone/ambiguous targets, current permission/consumption refusal, stable subject interning, current observation evidence, normal result codes/retries/uncertainty and no reset/output/private publication.
`frozen-execution/tests/capture.test.ts`: exact post-gateway lowering, all actual normal/fresh attempts and selected final receipt, one publication, unknown/uncertain/success-with-failure rejection, changed subject/non-address argument rejection and missing-final-hook unproven behavior.
Lead selectors: `pnpm --filter @fluxiq-web-extension/domain test src/runtime/llm-evidence/node-run/frozen-execution/tests src/runtime/llm-evidence/node-run/tests/run.test.ts src/runtime/llm-evidence/node-run/tests/replay.test.ts src/runtime/llm-evidence/node-run/retries/tests/dispatch.test.ts src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts`.
Affected package types and narrow structure gate are also lead-owned after Core0.22 source freeze/private SDK rebuild. The previously compiled0.21 SDK was never bypassed.

Outcome: Done
Changed: owned Down source/new feature/owning tests and this report
Validation: not run — brief explicitly reserves all checks/builds/audits to root after the fresh SDK
Not verified: compilation, authored/regression tests, structure gate, paired D0/D2 end-to-end integration, browser behavior or live execution
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-implementation.md`
Notes: Source frozen. No public/wire override or replay executor added. Root must validate before integration.
