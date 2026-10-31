# P8 native and authoring identity adapters

Outcome: Done. The bounded adapter, descriptor, trace and collocated test implementation is authored and source is frozen for lead verification. No checks, tests, typechecks, builds, audits, browser sessions, provider/API calls, git operations, versions, shared working documents or other reports were changed by this worker.

## Implemented behavior

The optional native `reacquireUnboundTarget` hook delegates candidate matching and replacement to the frozen shared helper. It admits only registered canonical definitions whose selector and element descriptors opt in, checks the fixed node/output container, and uses actual resolved request parameters. Unsupported outputs, empty/bare selector identities, state-bound adapted targets and row-value identities decline before refresh capture. The original source hook and its requests are unchanged; no fallback connects the two hooks.

A private memo holds at most 64 actual top/scoped captures and bounded attempt correlations. Only the actual capture's stateRef/stateSnapshotId and the actual before-action attempt may retrieve provenance. Reused refs retain the existing actual top provenance. A child gets a separate explicit before-action capture correlated to that current attempt and reused ref, rather than inheriting the top resource or timeOrigin. The ordinary top summary and `from` remain unchanged. The memo explicitly strips observation page data and state summaries; it retains only the state identifiers and scope/coverage/hidden provenance.

Native fresh reads issue the existing capture_snapshot action with includeHidden:true, a five-second timeout, the prior actual browser tab/frame, the original frame path, and metadata.sessionId. That metadata key is the real selector consumed by dispatchWebAutomationOutput, not a label. Source IDs are validated against the existing browser-owned `tab:N:frame:M` mapping and safe integer limits. A different session/source is rejected before native sanitization/matching. Safe whole location and actual document timeOrigin must match. Missing, evicted, mismatched or unproved provenance declines; partial/unknown child evidence cannot be substituted by the top capture.

Capture provenance uses only the shared raw-snapshot classifier. Requested includeHidden never becomes producer proof: missing or invalid evidence.captureOptions remains unknown. Observation errors, person-needed refusals, cancellation and timeouts cannot become gone. Abort checks before and after the awaited fresh read discard late patches. Found returns exactly two set operations for selector and element; wrapper, outputId, browser scope, effects, authority, values and saved/shared state are not modified.

Authoring accepts a saved resolved fingerprint without a transient handle, preserves the object state-bound exclusion, delegates matching/replacement, keeps the existing Core retry trigger and bounded look waits, and remembers the fresh look through run.looked. Before acting in a child it obtains an actual scoped prior capture; inability to obtain that optional recovery evidence does not replace the action's own outcome. Scoped capture forwards the actual scope and timeout, rejects a different selected session before dispatch, and carries both optional private binding fields by explicit names. Fresh returned scope/document provenance is compared with the prior capture.

Scope extraction follows IO's actual canonical-first nullish precedence: browserTabId ?? tabId and browserFrameId ?? frameId. Original fields are preserved. Invalid numeric scope and invalid frame paths decline instead of silently falling back to top frame. Frame paths use the existing exact-path validator.

Scoped or incomplete rememberLook views add known controls without erasing other-frame controls or fabricating truncation. Addressed local child controls retain their actual frame ID/path in the private target store. Selected saved identities receive the sixth structured record identity argument. Only shared canonical selector/element descriptors opt into targetRefresh.

The trace reader recognizes identity records without adding sourceNodeId or returned. It keeps only kind, outcome and a closed Core reason; source-shaped identity records are rejected, extra target/page/patch fields are dropped, and the old row/output conversion remains unchanged. No closed trace counterpart exists under the inspected local test-contracts source, so no additional contract path was needed.

## Exact edited paths

All downstream paths are relative to the private t828 !FluxIQWebExtension tree.

| Path | Change |
| --- | --- |
| domain/src/runtime/host-runtime.ts | Native hook, actual top capture memo and correlated child before-action captures. |
| domain/src/runtime/target-reacquire/reacquire-unbound-target.ts | New resolved/fixed-scope native adapter and two-patch answer. |
| domain/src/runtime/target-reacquire/identity/capture.ts | New trusted source/resource/document capture correlation. |
| domain/src/runtime/target-reacquire/identity/places.ts | New bounded private actual-capture/attempt memo. |
| domain/src/runtime/target-reacquire/index.ts | Export the new native adapter. |
| domain/src/runtime/llm-evidence/capture.ts | Scoped hidden-inclusive bounded read and explicit optional binding fields. |
| domain/src/runtime/llm-evidence/node-run/run.ts | Actual scoped prior authoring observation and scoped read callback. |
| domain/src/runtime/llm-evidence/node-run/retries/looked-up-reacquire.ts | Handle-independent shared matching wrapper with prior place proof. |
| domain/src/runtime/llm-evidence/plan-resolution/target-packets.ts | Additive scoped memory, child scope, and sixth structured-record argument. |
| domain/src/output-nodes/definitions.ts | Only selector/element descriptor opt-ins. |
| domain/src/runtime/tests/host-runtime-reacquire.test.ts | Native callback/context, pinned scope, resolved wrapper, top/child/reuse, unknown proof, hidden/partial/ambiguity, gone and abort cases. |
| domain/src/runtime/target-reacquire/identity/tests/capture.test.ts | Actual source/place, producer proof, partial coverage and changed/withheld document cases. |
| domain/src/runtime/target-reacquire/identity/tests/places.test.ts | Real attempt/ref correlation, scoped child reuse, bounded eviction and no page retention. |
| domain/src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts | No-handle authoring, actual scoped capture, source/session/place proof, field preservation, hidden/partial cases and cancellation. |
| domain/src/runtime/llm-evidence/plan-resolution/tests/target-packets-look.test.ts | Scoped additive memory, local child frame/path and selected stable record key. |
| domain/src/output-nodes/tests/definitions.test.ts | Positive selector/element declaration and negative non-target/other-output regressions. |
| packages/test-runner/src/recovery-matrix/records/trace-attempts.ts | Closed identity trace conversion without source fabrication. |
| packages/test-runner/src/recovery-matrix/records/tests/trace-attempts.test.ts | Identity privacy, closed diagnoses and malformed/source-shaped identity rejection. |

The lead added the two new identity barrel exports; this worker did not edit that shared-owned barrel. Shared matcher/producer/Core source and the lead's regression or E2E oracles were untouched. The sanitizer/location value leaves in identity/capture.ts are intentional existing-rule cycle exemptions: the evidence barrel reaches the capture implementation, which calls the identity capture owner; importing those values through that barrel would close the loop. Type-only directory crossings use the destination barrels.

## Verification boundary

Validation: not run. The brief explicitly prohibits checks while Core/generated SDK and other lanes mutate; source0.20/SDK0.19 remained unchanged by this worker. The tests are authored, not observed passes. Type compatibility, the focused tests, structure/import-cycle audits, actual native graph scheduling and installed extension/browser behavior remain for the lead after the final freeze. No paid execution or browser proof is claimed.

Outcome: Done
Changed: the 18 exact downstream paths listed above; this report only in Core
Validation: not run (bounded brief prohibits all checks/tests/builds/audits during concurrent implementation)
Not verified: generated SDK/type compatibility, test outcomes, structure audit, browser/E2E behavior or actual Core retry scheduling
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/native.md
Notes: Source frozen. Only the shared matcher can establish found/gone. Lead owns all acceptance checks and the realistic installed-browser proof.
