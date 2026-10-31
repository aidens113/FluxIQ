# Capture producer proof

Outcome: Done (source frozen; lead verification pending).

Changed downstream paths:
- `apps/extension/src/content/dom-snapshot.ts`
- `apps/extension/src/content/evidence/page.ts`
- `apps/extension/src/background/connection/dom-snapshot.ts`
- `apps/extension/src/content/tests/dom-snapshot.test.ts` (new)
- `apps/extension/src/background/connection/tests/dom-snapshot.test.ts`

The actual snapshot element-walk owner normalizes `options.includeHidden === true` once, passes that exact boolean to `renderedElements`, and returns the applied setting alongside the entries/counts. The existing exhaustive `present<PageEvidence>()` producer writes it under `captureOptions.includeHidden`. Normal, false and invalid settings produce false; literal true produces true. No protocol declaration was duplicated and no Domain/shared/native matcher path was edited.

Frame restatement preserves the marker. Merge writes a marker only when every included component has page evidence and every contribution positively supplies a boolean setting. All true produces true; known mixed/false produces false; missing or malformed proof produces an omitted marker. This includes an answered frame contributing elements without any page evidence: another frame cannot donate its proof. Requested flags cannot invent proof. Unanswered frames are not included components and remain separately named in `unansweredFrameIds`; this marker does not claim complete tab coverage.

Tests added:
- Real `captureSnapshot` on an empty document checks default/false/true/invalid capture settings.
- Frame merge checks all true, both mixed orders, all false, missing top/child/both proof, malformed child proof, a component missing all evidence, and a hidden-aware request receiving legacy evidence.
- Existing `content/tests/rendered-elements.test.ts` already checks hidden subtree membership. Its minimal walker fake does not support full snapshot descriptors, so no new full hidden-descriptor capture/browser harness was introduced.

Validation: not run, as the written brief forbids checks/builds/tests while Core/shared lanes are editing. No browser, API, git, agents, panel, runtime state, secrets or generated files touched.

Owning selector for the lead, from `apps/extension`:
`node scripts/test-extension.mjs content/tests/dom-snapshot.test.ts content/tests/rendered-elements.test.ts background/connection/tests/dom-snapshot.test.ts background/connection/tests/page-evidence-capture.test.ts`

Not verified: compilation, runtime tests, structure audit, full hidden-descriptor snapshot capture, real browsers, or public Domain projection omission. The latter was left unchanged and belongs to the lead/shared Domain lane. The new unit harness is intentionally an empty DOM and does not establish browser rendering behavior.

Source freeze: all five named downstream source/test files are frozen after this report. No further edits or validation will run in this worker without a lead follow-up.
