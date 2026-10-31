# Positive host topology gate

Source is frozen for lead validation against the separate frame-coverage producer.

`domain/src/runtime/runtime-repeat/capture.ts` now requires the frozen raw
`evidence.frameCoverage` marker: mode `all_frames`, enumeration `complete`, and
exactly `[0]` in both `frameIds` and `capturedFrameIds`. All existing actual
session/source/document, shown-count/sanitization/loading and no-child-descriptor
gates remain. Missing normalized child IDs and capture request options are never
treated as topology proof. Legacy captures retain ordinary host summaries and
execution, but supply no private equality observation.

The corrected shown-count comparison is retained: returned and matched equal
the raw shown descriptor count; a hidden-inclusive descriptor list may be longer.
No includeHidden proof is required for the shown view. Observer still reuses
already accepted captures and has no gateway command access.

The actual-host test fixture now carries the new positive producer marker.
Added negative cases for missing/null/string/empty markers, unavailable enumeration,
wrong mode, empty lists, duplicate enumerated/replied IDs, complete children,
unanswered children, mixed reply scope, string IDs and missing reply IDs. Each
case asserts an ordinary summary still returns, the observer abstains and only
the original capture command was dispatched. Existing hidden-inclusive positive
case and prior identity/state/scope/reuse/abort tests remain authored.

Updated the owned repeat-observation architecture section with the marker and
its source-of-truth rule. No producer types/background, Core, public ports,
shared documents, baseline, generated state or git were touched.

Outcome: Done
Changed: domain/src/runtime/runtime-repeat/capture.ts; domain/src/runtime/tests/host-runtime-repeat.test.ts; docs/architecture/element-identity.md; this report
Validation: not run (parallel source-authoring prohibition from lead)
Not verified: Compilation, authored tests, actual new producer integration, structure audit or browser behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/host-topology-gate.md
Notes: Source frozen. Separate worker owns actual enumeration/reply telemetry. Lead owns SDK rebuild and acceptance validation.
