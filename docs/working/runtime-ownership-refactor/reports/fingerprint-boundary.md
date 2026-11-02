# Fingerprint boundary discovery

Outcome: Done
Changed: `docs/working/runtime-ownership-refactor/reports/fingerprint-boundary.md`
Validation: read-only source tracing; no tests or builds run by brief.
Not verified: no matcher migration was implemented or behaviorally exercised.
Report: `docs/working/runtime-ownership-refactor/reports/fingerprint-boundary.md`
Notes: Downstream already supplies browser-specific preprocessing and DOM candidate enumeration. Core has additional internal production callers that currently instantiate the matcher themselves.

## Findings

### Core implementation mixes neutral state matching with browser vocabulary

`packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:4-24, 54-74, 90-110` defines and scores one `ElementFingerprint` shape. It compares neutral or reusable evidence (`visibleText`, `accessibleName`, `label`, `entityId`, `entityKind`, `statePath`, `bounds`, visibility) alongside browser-shaped fields (`tagName`, `selector`, `xpath`, `url`, `classNames`, `attributes`). `queryPath` is shared vocabulary: Core's architecture names it as a neutral address alongside `statePath`, so it should remain eligible in a generic contract if its semantics are retained as an address rather than a DOM selector. `candidatesFromStateSnapshot` at `:184-250` derives candidates from visual layers and state values, but reads browser keys (`tagName`, `selector`, `xpath`, `classNames`, `attributes`, `url`) out of generic layer metadata. A browser-safe module graph is not an ownership boundary: its import-closure test (`fingerprinting/tests/index.test.ts`) proves only that the code can bundle without Node imports.

Core's saved action target model at `model/action-element-target.ts:6-35, 82-95, 137-163` repeats the mixed fields. That model normalizes and sanitizes targets; it is also the durable interchange surface, not merely a scorer input. It already treats `drawing` as an opaque token written by a domain and expressly says Core does not score or interpret it (`:18-25`). This is a useful pattern for the browser-only signals.

### Exact production call chains in Core

1. **Policy output dispatch (direct Core decision):** `runtime/io-policy.ts:13,17` creates a module-level default matcher. `dispatchPolicyOutput` / `createRuntimePolicyEffectDispatcher` call `prepareElementTargetAction` (`:32-38, 93-110`), which normalizes `parameters.target` or the parameters themselves and calls `resolveElementTarget` (`:233-261`). `resolveElementTarget` uses `elementMatcher.bestCandidate(target.fingerprint, target.candidates)` at `:276`, then enforces the output's minimum confidence and rewrites the target with selection/diagnostics before dispatch. This makes Core's browser-shaped scoring part of the generic IO/runtime route, not only a downstream convenience.

2. **Importer node and domain target-resolver API:** `runtime/native-node-runtime.ts:2,40,130-141` constructs the same matcher and injects it into every importer implementation and every registered target resolver. `nodes/importer-sdk.ts:3,87,94,99` exposes `AutomationStudioElementMatcher` directly in both importer implementation and resolver contexts. `resolveTarget` resolves an adapter by domain and forwards the default matcher. Domain implementations can therefore depend on Core's browser scoring API.

3. **Recording mapper/proposal pipeline:** `runtime/service.ts:2100` passes `nativeNodeRuntime.elementMatcher` to `recordingProposalForMapper`; `runtime/service/recordings/proposal-generation.ts:6,33,66` injects it into mapper implementations. This is another externally consumed path that must be migrated or preserved.

4. **Snapshot candidate extraction:** `candidatesFromStateSnapshot` is exposed on the matcher and called in Core tests; production references found in source are limited to the matcher itself/API. Keep a generic snapshot-to-candidate projection only for neutral state fields, or move the web metadata projection with the web matcher.

### Downstream already has a browser adapter; it is not a Core-only dependency

`apps/extension/src/content/identity/score.ts:103,242,252-284,339-342` imports `createAutomationStudioElementMatcher` from `fluxiq/automation-studio/fingerprinting`. The extension preprocesses recorded signals (`comparableFingerprint`, including dropping stale/generated ids and selectors), gates candidates by web record/dialog context, adds drawing evidence and invokes `matcher.scoreCandidate`; then its own code applies the web-specific floor, margin, and corroboration policy. `apps/extension/src/content/identity/candidates.ts` constructs live DOM fingerprints, and `apps/extension/src/content/action-runtime/resolve-target.ts:386,431` calls the downstream selection routine. This is the browser-specific ownership that can absorb scoring and candidate extraction; current selector resolution, XPath, shadow DOM, and DOM traversal already remain in the extension.

`domain/src/element-fingerprint/build.ts` creates the persisted `WebAutomationElementFingerprint` for recorded action targets. `domain/src/recording/web-state/action-target.ts` emits the Core target shape, and `domain/src/actions/types.ts` describes that target as the recorded action identity. These indicate the downstream domain owns the web schema and persistence semantics even though the current generic Core target DTO accepts that shape.

## Safe ownership cut

1. **Keep Core's persistence/transport compatibility surface intact initially.** Keep `AutomationStudioElementTargetFingerprint`, candidate IDs, selection/result fields, normalization, sanitization and the existing wire field spellings so older recordings, flows, proposals and runtime action parameters still parse and round-trip. The persisted `selector`/`xpath` values are data; removing their scoring does not authorize dropping or rewriting them. Keep drawing opaque under its existing rule.

2. **Split the scorer contract from the target DTO.** Core can retain a generic matcher contract for neutral state identity and presentation evidence: text/label/name, `entityId`/`entityKind`, `statePath`/neutral `queryPath`, and generic bounds/visibility where meaningful. Core's generic candidate projection must stop interpreting browser `tagName`, selector, XPath, URL, class list and arbitrary DOM attributes from state metadata. A neutral field's continued presence in a serialized target does not make every runtime a consumer of it.

3. **Move web scoring decisions and web candidate projection to the downstream domain.** The downstream implementation should own selector volatility and absence filtering, tag/role/class/attribute semantics, URL handling if needed, drawing-as-attribute adaptation, DOM candidates, and the web score floor/margin/corroboration policy. It can compose a neutral Core scorer for shared evidence only if the combined score/ranking contract is explicit; otherwise keep the web scorer as a domain-owned implementation and consume a small neutral score/result contract. Do not move browser behavior into a new Core subpath just because that subpath remains browser-bundle-safe.

4. **Replace Core's implicit default matcher in production call sites.** Make domain scoring an explicit adapter dependency for output target preparation, importer implementations/resolvers, and recording mappers. In particular, `io-policy.ts` cannot silently instantiate a default scorer and make a browser-specific decision for arbitrary domains. If no matcher is registered, retain the existing safe unresolved/delegated behavior (Core already leaves targets without runtime candidates unresolved); do not select a candidate using a different partial score. Preserve Core's confidence floor enforcement as generic policy only if it receives an explicit adapter measurement and the contract states what that confidence means.

5. **Migrate compatibility in a paired sequence.** First publish/add the downstream web matcher and switch extension callers while Core still exports the old API. Then migrate registered Core importer/mapping contexts to a neutral interface or explicit domain matcher and wire policy dispatch to the domain adapter. Keep the old Core export/type as a deprecated compatibility layer for at least the agreed consumer window; Core cannot forward to downstream without violating the repository boundary. Only remove or narrow the old public API after all in-repo consumers have moved and package compatibility policy permits it. Pin old serialized fixtures and round-trip assertions so the refactor cannot mutate saved `element` fingerprints or runtime payloads.

## Focused checks for the implementation phase

- Core matcher unit tests: `packages/fluxiq/src/programs/automation-studio/fingerprinting/tests/element-fingerprint.test.ts`; extend with neutral state identity cases and assertions that browser metadata has no generic scoring effect.
- Core browser-safe subpath contract: `packages/fluxiq/src/programs/automation-studio/fingerprinting/tests/index.test.ts` (update expected public boundary if the export changes).
- Core output target path: `packages/fluxiq/src/programs/automation-studio/runtime/tests/io-policy.test.ts`, especially existing "element target miss" coverage around line 237; add missing-adapter and explicit-adapter cases.
- Core importer injection path: locate/extend `runtime/native-node-runtime` tests for implementation and resolver contexts; assert the injected matcher is the registered domain matcher and no implicit browser matcher is created.
- Core recording proposal generation: focused tests beside `runtime/service/recordings/proposal-generation.ts`; ensure mapper context still resolves the same adapter while consuming the new interface.
- Downstream web selection: tests under `apps/extension/src/content/identity/tests/` for `score.ts`, and `apps/extension/src/content/action-runtime/tests/` for `resolve-target.ts`; preserve volatile-selector, drawn-control and ambiguity/refusal fixtures.
- Downstream persistence compatibility: domain recording/action-target and runtime action-parameter tests that pin selector/xpath and fingerprint round-tripping. Run touched package typechecks and the structure audit after focused tests; no full suites required by this brief.
