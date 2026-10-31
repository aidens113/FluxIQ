# Frame coverage producer work

Outcome: Done (source authored and frozen for lead validation).

## Authored changes

Downstream paths:
- `apps/extension/src/content/evidence/page.ts` (only exhaustive undefined marker)
- `apps/extension/src/background/connection.ts` (observed helper import/transport)
- `apps/extension/src/background/connection/server-command-channel.ts` (same)
- `apps/extension/src/runtime/action-runner.ts`
- `apps/extension/src/runtime/look-across-frames.ts`
- `apps/extension/src/runtime/tests/look-across-frames.test.ts`
- `apps/extension/src/background/tabs.ts`
- `apps/extension/src/background/tests/tabs.test.ts`
- `apps/extension/src/background/connection/dom-snapshot.ts`
- `apps/extension/src/background/connection/tests/dom-snapshot.test.ts`
- `apps/extension/src/background/connection/tests/page-evidence-capture.test.ts`
- `domain/src/page-evidence/types.ts`
- `domain/src/page-evidence/tests/capture.test.ts`
- `docs/architecture/page-evidence.md`

Raw optional contract is exactly the frozen field: frameCoverage mode all_frames,
enumeration complete/unavailable, frameIds and capturedFrameIds.

`observedTabFrames` preserves native enumeration failure as undefined; legacy
`allTabFrames` wraps it and preserves [] for its existing callers. Native helper
handles API absence, callback lastError, missing result and synchronous throw.
Merge validates IDs and requires valid nonempty lists containing 0 on both bounded
reads, with equal sets, before complete. Valid observed IDs from the first read
are published sorted/unique; malformed IDs never enter published IDs or requests.
Requested-ID genuine snapshot replies are published sorted/unique, including a
validated supplied seed. Empty child documents still count. Existing browser
enumeration order is preserved for element/evidence merge order. Missing child
replies retain unansweredFrameIds. No descriptor-derived topology or invented
frame 0 enumeration.

The first topology read precedes newly requested snapshots; the post-read spends
only the time remaining within the original two-wait merge envelope. An ordinary
supplied seed without actual earlier topology provenance ALWAYS reports
unavailable. `prepareMergedTabSnapshot` retains the real bounded pre-capture
enumeration in a closure, to compose a subsequently captured seed. Tests author
enumerate -> external top capture -> enumerate, exactly one top request, complete
[0]/[0]. It still does not prove document identity stability, atomic capture or
semantic DOM completeness. No additional snapshot/action command is issued.

Explicit single-frame capture does not manufacture the marker. Historical
capture data and substantive equality assertions are preserved; merge-only
provenance is asserted independently, and historical content captures classify
all four new nested fields as not exercised.

## Native host routing completed

All requested additional ownership was granted in the brief and implemented.
The per-frame content writer explicitly omits frameCoverage; native transports
preserve API failure with observedTabFrames. Runtime action-runner invokes the
optional merge preparation only for an unaddressed capture before sending its
unchanged top RPC. The native server hook calls prepareMergedTabSnapshot and
returns a closure retaining the genuine prior enumeration. The existing post-RPC
look merge uses that closure with its actual capture options and remaining wait.
Legacy merge callbacks remain callable unchanged, but an unprepared diagnostic
seed cannot acquire positive provenance. Explicitly addressed captures skip
preparation entirely. No additional snapshot or public wire field is introduced.

The prepared closure retains its absolute original deadline (the command's
remaining deadline when supplied; the original two-wait capture envelope when
none was supplied). Time spent preparing/capturing top cannot renew that
allowance. Child requests and the post-topology read spend only its remaining
time. Authored tests cover exhausted prepared deadlines and runtime preparation
selection, order, legacy callbacks, and remaining-wait forwarding.

## Authored acceptance coverage

Tests cover genuine top-only topology, empty parentless child, failed and malformed
child replies, unknown/error/timeout/empty/malformed/top-less enumeration, changed
sets and failed post-read, enumeration and reply order independence, bounded
post-read timeout, pre/capture/post call order with one snapshot request, explicit
single-frame omission, native API error/absence compatibility and historical
optional-field absence. Existing exact single-frame merge equality assertions now
separate merge-only marker while retaining complete equality of historical data.

Validation: not run (brief prohibits all checks/tests/build/audit/browser/API,
provider, panel and runtime execution during parallel authoring).
Not verified: compilation, authored test results, structure budgets, installed
native transport proof and live browser behavior. No git or agents used.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/frame-coverage.md

Notes:
- All authored owned sources are frozen for lead integration/checks.
- No historical browser fixtures or generated/runtime state changed.
- No gateway/model packet/capability/auth/permission behavior changed.
