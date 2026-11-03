# Active target preparation boundary

Outcome: design complete, READ-ONLY; all package source/tests remain FROZEN. No compiler/runtime/build/provider/browser checks ran. Paths below are relative to paired t843 repositories.

## Verified production paths

- Core `programs/automation-studio/runtime/output-target/prepare.ts` is the active browser output adapter. It reads legacy target shapes and `elementTarget`/`targetKind` metadata, normalizes twice, applies the selected matcher/confidence floor and projects only parameters/diagnostics/resolution.
- `service/runtime-session/graph-options.ts` constructs it for every IO domain; `runtime/io-policy.ts` constructs it in three public compatibility functions. Repository searches found no production callers of those three functions; the graph-options adapter is active.
- Core `service/object-documents.ts:prepareRecordingEntryElementTarget` is the other normalization caller. It runs on action entries before snapshot dehydration, with precedence target.elementTarget -> parameters.target -> target plus visualTarget, preserving existing entry identity/output/result fields.
- `service.ts:appendRecordingEvents` already loads the ORIGINAL recording inside its mutation lock before calling ObjectDocuments. Use that recording's `environment.domainId`; do not select code from entry metadata, action output spelling or submitted target shape. No project fallback is required to preserve the current recording scope.
- Downstream `domain/src/target-normalization/{normalize,recording-parameters}.ts` already owns the full normalizer and mapper adapter. Its existing report records 650 historical exact-byte comparisons; this task did not rerun them.
- `domain/src/output-nodes/native-runtime.ts` binds the original mapper adapter and matcher in the implementation bundle; `domain/src/web-panel-host.ts` registers that bundle before binding the NativeNodeRuntime. Its IO outputs delegate to `dispatchWebAutomationOutput` without another normalization pass.
- Core `runtime/native-execution/native-node-runtime.ts` already scopes matcher/mapper-normalizer code by manifest.domainId, validates package/version before registration and pins the original normalizer's bundle receiver. Extend that instance-owned authority; add no global registry/context/receipt map.

## Concrete interfaces

1. Keep existing public `OutputTargetPreparer` and `OutputTargetPreparation` shapes unchanged. Add `outputTargetPreparer?: OutputTargetPreparer` to the trusted SDK implementation bundle, never the serialized manifest/model request.
2. Add a neutral `OutputTargetPreparerBinding` with readonly `receiver: object | undefined` and `callback: OutputTargetPreparer`; this is invocation identity, not a new target DTO. `getOutputTargetPreparer(domainId)` returns that pinned original binding or undefined.
3. Permit the existing output-dispatch/integration `targetPreparer` option to accept either its old function or this binding. A bare function retains receiver undefined; a registered binding invokes the ORIGINAL callback with the ORIGINAL bundle receiver through `invokeObservedOutputSync`. No bound/anonymous wrapper may hide the original pair.
4. Add a neutral recording port under `runtime/recording/target-preparation`: `RecordingEntryTargetPreparer = (domainId: string, entry: Readonly<Extract<AppendRecordingEntryInput, {type: "action"}>>) => Pick<Extract<AppendRecordingEntryInput, {type: "action"}>, "parameters" | "target"> | null`, importing the EXISTING canonical contracts, whose target is unknown.
5. Add `recordingEntryTargetPreparer?: RecordingEntryTargetPreparer` to the same implementation bundle and `getRecordingEntryTargetPreparer(domainId)` returning its original receiver/callback binding. Null means retain the original entry object; Core applies only parameters and an explicitly present target field, ignoring extra returned identity/output/result fields.
6. Root passes the current recording domain plus resolved binding to `prepareRecordingEntriesForStorage` as an additional internal argument. Selection happens under the existing recording lock, once per batch; non-action entries remain identical. No hook means opaque entries remain unchanged, never executable solely because they contain a target.
7. Register both hooks atomically with the existing SDK checks: reject nonfunctions, foreign package/version and conflicting original function OR receiver for one domain before mutating any registry. Re-registering the identical original bundle pair is idempotent; one domain must never borrow another domain's hook or deprecated default matcher.

## Missing-hook and callback ownership

- Preserve generic `dispatchRegisteredOutput`'s existing unprepared opaque pass-through for ordinary outputs. Add neutral registered-output metadata `outputTargetPreparationRequired: true`; without a selected hook it refuses BEFORE confirmation/dispatch with `output_dispatch.target_preparer_unavailable`. This is a deny-only prerequisite on the registered definition, never an action/model capability grant.
- Downstream marks its existing eight element-required outputs with that neutral requirement. The installed web hook preserves the existing `element_target.missing_fingerprint`, no-match/below-confidence, no-candidates/no-matcher and selected-candidate behavior exactly. Non-targeted navigation/tab/key/scroll semantics remain unchanged.
- A trusted bundle is executable code registration, not completion evidence. Apply existing canonical callback policies to the EXACT selected pair before observed sync invocation; no automatic pure/frame declaration for all registered hooks. Known original downstream no-IO normalizer/preparer code may declare its actual pair through the public canonical policy/configuration seam.
- Default web preparation must pin the original default matcher method and receiver. An overridden supplied matcher/hook retains its own contract; do not mark an outer closure pure while it can invoke arbitrary mutable supplied callbacks. Missing/foreign/copied declaration must not clear observation history.
- Use the same existing observation owner when recording preparation occurs inside observed execution; add no ambient current receiver, shared bundle handoff or serialized observation field. Preserve the original callback error and first result; unsupported callbacks cannot earn a completion receipt from fulfillment.

## Disjoint implementation ownership

| Unit | Owned source paths |
| --- | --- |
| Core ports/binder | `components/automation/importer/implementation-bundle.ts`; `runtime/native-execution/native-node-runtime.ts`; new `runtime/recording/target-preparation/**`; new output-preparer identity leaf |
| Core generic invocation | `runtime/output-dispatch/{prepare-action,target-preparer}.ts`, actual dispatcher/integration type forwarding, required-hook refusal result, original-pair sync policy application |
| Root composition | Studio `service.ts` recording lock call; `service/object-documents.ts` removes browser helper; `service/runtime-session/graph-options.ts` selects original bundle hook; IO compatibility signatures, parent barrels/package exports/version/docs |
| Downstream target owner | `domain/src/target-normalization/**` adds recording-entry projection and exact validation helpers; new `domain/src/output-nodes/target-preparation/**` moves actual old output-preparation algorithm; `output-nodes/native-runtime.ts` installs both hooks |
| Downstream declarations | `domain/src/io/manifest-definitions.ts` neutral required-hook prerequisite; `domain/src/web-panel-host.ts` keeps actual bundle/IO composition; old references/comments/tests migrate to domain public exports |

The output adapter uses existing neutral `matchOutputTarget`, `outputTargetMinimumConfidence`, failure/result and compact helpers through Core public APIs; Core retains generic matching math without reading browser signals. Downstream alone reads selector/xpath/queryPath/tagName/url or legacy element metadata. Preserve the current web default/override matcher selection explicitly.

## Compatibility and remaining deletion prerequisites

- `normalizeAutomationStudioElementTarget`, `isAutomationStudioElementTarget` and `validateAutomationStudioElementTarget` are currently public through Studio's model barrel. Downstream production does not import these executable functions; named domain/extension identity tests still do. Migrate those tests to actual domain public owners with unchanged literal oracles.
- Core `model/validation/recording.ts` still calls the validator, and `client-gateway/ingress/target.ts` still validates elementTarget; `ingress/policy.ts` and `client-gateway/bridge.ts` install that policy. These are REAL remaining browser interpretation, not passive type aliases. Do not delete the public functions while retaining hidden Core duplicates.
- Move the actual validator into downstream target-normalization and inject it through existing `RecordingTargetValidationPolicy<unknown>` and `RecordingIngressPolicy` seams selected from authenticated domain composition. The ingress policy currently has no per-entry domain argument, so Root must supply a per-recording/session-scoped policy selection at the bridge owner; never infer it from target fields. This policy handoff is a separate bounded prerequisite to deleting the old executable API.
- Full rich legacy target/fingerprint/candidate/selection/source/validation DTOs may remain passive interchange types, with exact aliases if their data authority is promoted. Core cannot offer an executable reexport of downstream code without violating dependency direction.
- Removing the old default Studio preparer and matcher-only IO helper semantics is a below-1.0 breaking migration: pair the Core minor/API removal with downstream imports and version/build guard updates. Keep generic function-call compatibility where possible; never preserve an implicit browser fallback merely for the old signature.

## Required focused acceptance and order

1. Add ports, original-pair registry tests and generic invocation tests first; Root exports public seams. Then implement downstream hooks with literal old-output and old-recording cases; integrate both actual Core callers; finally route validation/ingress and remove executable browser API.
2. Preserve Core `runtime/output-dispatch/tests/preparation.test.ts`: original action/parameters/definition identity, confirmation order, extra-field nonauthority, refusal/throw, opaque no-hook behavior. Add required-hook missing, other-domain/cross-package/rebinding and observed original receiver/function cases.
3. Preserve old `runtime/tests/io-policy.test.ts` missing fingerprint, no matcher/candidates, exact floors and trace diagnostics in downstream preparation tests; use the real web matcher. Change Studio graph-options tests to assert explicit registered selection, not unconditional legacy normalization.
4. Preserve downstream `target-normalization/tests/normalization.test.ts`, `output-nodes/targets/tests/targets.test.ts`, `client/tests/gateway-mapping{-identity,-read-mark}.test.ts`, `recording/web-state/tests/action-target.test.ts` and extension identity/chooser replay subjects. Only retarget helpers/imports; keep byte/identity/privacy/repaired-vs-recorded precedence oracles.
5. Add real recording append/storage round trips: action and passive entry identity; target/parameters/visualTarget precedence; candidate/selected/drawing/bounds retention; sensitive metadata withholding; no domain/no hook/cross-domain target unchanged; original callback failure prevents writes. Keep ObjectDocuments snapshot dehydration/ref-only/conflict tests unchanged.
6. Verify full+erased public source closure contains no downstream/private browser imports in Core; no new Studio dependency in ports; public declaration build and normal guarded paired package acceptance after all source owners freeze. No source-local probe substitutes for those gates.

Validation: read-only named source/call-site searches; no tests, probes, compiler, build, providers, browser, runtime/private values or git.
Not verified: proposed signatures are design, not implemented/typechecked; current built packages and composed Service remain pending separate native lane freeze/acceptance.
Report: docs/working/runtime-ownership-refactor/reports/active-target-boundary.md
Notes: Source/tests FROZEN. Only this own report changed. Native-log discovery awaits Root's next written brief.
