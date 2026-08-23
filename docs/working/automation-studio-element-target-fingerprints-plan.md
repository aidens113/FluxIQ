# Automation Studio Element Target Fingerprints Plan

Status: implemented  
Created: 2026-08-22  
Scope: Automation Studio recording capture, recording mappers, native/custom
extension output nodes, runtime element matching, and domain-neutral persisted
target contracts.

Implementation progress:

- Part 1 completed 2026-08-22. Added the domain-neutral
  `AutomationStudioElementTarget` model contract, normalization helpers for
  legacy selector-style targets, sensitive metadata stripping, validation, and
  recording-session validation hooks. Focused validation passed:
  `pnpm --filter fluxiq check` and
  `pnpm --filter fluxiq test -- model/action-element-target.test.ts
  model/action-visual-target.test.ts model/model.test.ts`.
- Part 2 completed 2026-08-22. Recording append now normalizes action targets
  before storage, preserving canonical element fingerprints on both
  `action.target.elementTarget` and `action.parameters.target` when element
  signals are present. Focused validation passed:
  `pnpm --filter fluxiq check` and
  `pnpm --filter fluxiq test -- runtime/service.test.ts
  model/action-element-target.test.ts`.
- Part 3 completed 2026-08-22. Recording proposal validation now normalizes
  mapper-emitted legacy element target objects into canonical
  `parameters.target` envelopes before proposals and reviewed Flow nodes are
  persisted. Focused validation passed:
  `pnpm --filter fluxiq check` and
  `pnpm --filter fluxiq test -- runtime/service.test.ts
  model/action-element-target.test.ts`.
- Part 4 completed 2026-08-22. IO policy dispatch now normalizes canonical
  element targets at runtime, matches supplied candidates with
  `elementMatcher`, stores selected-candidate diagnostics in dispatch
  metadata/outputs, and rejects outputs that explicitly declare element
  targeting without an element fingerprint. Focused validation passed:
  `pnpm --filter fluxiq check` and
  `pnpm --filter fluxiq test -- runtime/io-bridge.test.ts
  runtime/native-node-runtime.test.ts fingerprinting/element-fingerprint.test.ts`.
- Part 5 completed 2026-08-22. Recording proposal nodes now expose compact
  element target summaries in inspector metadata/parameters, including visible
  text, accessible name, id/test id, selector, selected candidate, confidence,
  and matched/failed signals when present. Focused validation passed:
  `pnpm --filter @fluxiq/web check` and
  `pnpm --filter @fluxiq/web test -- ProposalView.test.ts`.
- Final enforcement audit completed 2026-08-22. Native/custom node contexts
  now expose registered target resolvers through `resolveTarget`, output
  dispatch enforces safety-based element match confidence thresholds, and
  visual-target entity/state-path data enriches recorded fingerprints. Focused
  validation passed:
  `pnpm --filter fluxiq check` and
  `pnpm --filter fluxiq test -- runtime/io-bridge.test.ts
  runtime/native-node-runtime.test.ts model/action-element-target.test.ts`.
- Full validation completed 2026-08-22. `pnpm docs:reference`,
  `pnpm docs:check`, `pnpm build`, `pnpm check`, and `pnpm test` all passed.
  Build/check/test were run sequentially for the final pass because the build
  cleans package `dist` outputs that web check/tests resolve.

## Purpose

Automation Studio now has a shared element fingerprint matcher, but it is not
yet the universal path for every element-targeting output. This plan closes
that gap: recordings should capture enough non-sensitive data to find the same
element later, generated Flow actions should persist that fingerprint, and
runtime output nodes should resolve element targets through the common scoring
system before dispatch.

The goal is a domain-neutral element targeting contract that is more robust
than selectors or XPath alone. Stable and human-readable signals should carry
the most weight, while selectors, query paths, XPath, bounds, and class names
remain useful supporting evidence.

## Current State

Implemented foundation:

- `fingerprinting/element-fingerprint.ts` defines `ElementFingerprint`,
  `ElementFingerprintCandidate`, weighted scoring, best-candidate selection,
  contribution diagnostics, and `StateSnapshot` candidate extraction.
- `AutomationStudioNativeNodeContext` includes `elementMatcher`.
- Recording mapper implementations receive `context.elementMatcher`.
- Native/custom importer node implementations receive the same matcher.

Current gap:

- Output dispatch still accepts element parameters without requiring or
  resolving a fingerprint.
- Existing output implementations can still pass a raw selector directly to
  domain adapters.
- Recording capture and proposal generation do not yet guarantee all element
  actions persist a complete enough fingerprint.
- Target resolver declarations exist, but they are not yet part of a common
  execution path for element output actions.

## Target Contract

Recorded and runtime element actions should use a canonical target envelope:

```ts
type AutomationStudioElementTarget = {
  kind: "element";
  fingerprint: ElementFingerprint;
  candidates?: ElementFingerprintCandidate[];
  selectedCandidate?: {
    candidateId: string;
    confidence: number;
    matchedSignals: string[];
    failedSignals: string[];
  };
  source?: "recording" | "runtime" | "mapper" | "operator" | "inferred";
  metadata?: JsonObject;
};
```

The exact type name can change during implementation, but the behavior should
not:

- `fingerprint` is the durable replay contract.
- `candidates` are optional current-observation evidence and may be omitted
  from long-lived artifacts when too large.
- `selectedCandidate` records why the current choice was accepted.
- Sensitive values must never be persisted in fingerprints.

## Fingerprint Data To Capture

Capture as much of this as is available and non-sensitive:

- visible text;
- accessible name or ARIA label;
- element label;
- DOM id;
- test id, data-testid, data-test, or equivalent stable automation id;
- importer/runtime entity id and entity kind;
- state path when the element is represented in `StateSnapshot`;
- role and tag name;
- selector and query path;
- XPath only as supporting evidence;
- URL or route context;
- viewport/document bounds;
- non-sensitive stable attributes;
- class names as low-weight supporting evidence;
- visual frame/layer references when the target was derived from State View.

Do not persist:

- passwords, tokens, credentials, or authorization values;
- full form values unless the importer marks them safe and non-sensitive;
- large DOM snapshots;
- screenshot pixels inside the fingerprint object;
- domain-private behavior in the framework package.

## Runtime Execution Model

Element output execution should follow this path:

1. Normalize incoming target parameters into `AutomationStudioElementTarget`.
2. Build runtime candidates from the current `StateSnapshot`, extension
   candidates, or a target resolver.
3. Run `elementMatcher.bestCandidate(fingerprint, candidates)`.
4. Dispatch to the domain output adapter with the resolved candidate plus the
   original fingerprint.
5. Store match diagnostics in action/runtime trace metadata.
6. Fail or request review when confidence is below the configured threshold and
   the action safety level requires certainty.

The IO dispatcher remains the registered-output boundary, but element-aware
outputs should not bypass the shared matcher. If an output contract declares
that it targets an element, FluxIQ should either resolve it through the matcher
or emit a visible validation issue.

## Recording And Proposal Model

Recording capture should attach element fingerprints to action entries when
the user clicks, types into, selects, hovers, drags, or otherwise acts on an
element.

Recording mappers should:

- prefer the captured fingerprint over rebuilding from a selector;
- enrich missing fields from `StateSnapshot` candidates when available;
- set proposal/action parameters to the canonical element target envelope;
- include confidence and selected-candidate diagnostics;
- preserve evidence links to the original recording entry and state snapshot.

Proposal review should show the resolved target identity in human terms:
visible text, accessible label, id/test id, role, and confidence. Raw XPath
should be visible only as detail evidence, not as the primary identity.

## Target Resolvers

Importer target resolvers should become the extension point for translating a
domain-specific target shape into the common element target envelope.

Planned behavior:

- Native runtime keeps the registered resolver lookup.
- Element output nodes can declare the resolver id they require or support.
- Before dispatch, FluxIQ invokes the resolver with the original target and
  `{ signal, elementMatcher }`.
- The resolver returns a normalized element target, a resolved candidate, or
  `null` when it cannot resolve.
- Resolver failures are traceable and do not silently fall back to brittle
  selectors.

## Implementation Plan

### Part 1: Canonical Types And Validation

- [x] Add a domain-neutral `AutomationStudioElementTarget` contract near model
  actions or fingerprinting.
- [x] Add guards/normalizers for legacy `{ selector }`, `{ xpath }`, and existing
  `ActionTarget` shapes.
- [x] Add validation helpers that reject sensitive or oversized target metadata.
- [x] Add tests for normalization, legacy compatibility, and sensitive-field
  stripping.

Acceptance criteria:

- Existing flows with selector-only targets still load.
- New element targets round-trip through storage.
- Validation returns actionable issues for incomplete or unsafe fingerprints.

### Part 2: Recording Capture Contract

- [x] Update recording event/action target shapes to carry the canonical target.
- [x] Capture fingerprints from available browser/extension observations.
- [x] Link captured targets to state snapshot visual layers where possible.
- [x] Add storage tests for recorded element actions with complete fingerprints.

Acceptance criteria:

- A recorded click stores visible text/id/test id/role/tag/selector/bounds when
  available.
- Sensitive fields are omitted.
- Recording state index can recover the state snapshot associated with the
  captured target.

### Part 3: Mapper And Proposal Generation

- [x] Update built-in/fallback recording candidate creation to preserve element
  fingerprints.
- [x] Encourage importer mappers to return canonical element targets.
- [x] Enrich mapper/runtime results with `elementMatcher` selected-candidate
  scores when candidates are supplied.
- [x] Add proposal tests proving action parameters contain the canonical target.

Acceptance criteria:

- Generated proposal action nodes no longer store only a raw selector for
  element actions when richer evidence exists.
- Review artifacts include selected-candidate confidence and signal
  diagnostics.

### Part 4: Runtime Output Enforcement

- [x] Add an element-target resolution step before element output dispatch.
- [x] Route importer/custom output node element parameters through the matcher.
- [x] Integrate registered target resolvers where declared.
- [x] Add confidence thresholds based on action safety metadata.
- [x] Add runtime trace diagnostics for match success, low confidence, and failure.

Acceptance criteria:

- Element output nodes cannot silently bypass the matcher when their contract
  declares element targeting.
- Low-confidence matches fail visibly or require review according to safety.
- Runtime traces show matched and failed signals.

### Part 5: UI Surfaces

- [x] Show fingerprint identity in proposal review and action/node inspectors.
- [x] Prefer visible text/accessibility label/id/test id in compact labels.
- [x] Show selector/XPath as supporting evidence.
- [x] Add confidence and signal diagnostics to debug/details panels.

Acceptance criteria:

- Users can understand what element a recorded action will target without
  reading XPath.
- Debug details expose why a runtime target matched or failed.

### Part 6: Migration And Compatibility

- [x] Keep legacy selector-only actions executable through normalization.
- [x] Add warnings for legacy targets with low replay confidence.
- [x] Avoid destructive migration; update persisted targets only when a Flow or
  proposal is explicitly saved/reviewed.
- [x] Document importer migration guidance.

Acceptance criteria:

- Old recordings and flows remain readable.
- New saves use the canonical target shape.
- Importer docs explain how to emit and resolve fingerprints.

## Open Questions

- Where should the framework mark an output contract as element-targeting:
  `outputAction`, output definition metadata, parameter schema metadata, or a
  dedicated target resolver declaration?
- Should the runtime require a live `StateSnapshot` for element outputs, or
  allow extensions to supply candidates directly when no snapshot exists?
- What default confidence threshold should apply to safe clicks versus typing,
  destructive actions, and privileged actions?
- How much candidate history should be retained in proposals before it becomes
  too large or stale?

## Validation Plan

Run focused checks after each part:

```bash
pnpm --filter fluxiq test -- fingerprinting runtime model storage
pnpm --filter fluxiq check
pnpm --filter @fluxiq/web test
pnpm --filter @fluxiq/web check
```

Run full gates before closing the plan:

```bash
pnpm check
pnpm test
pnpm build
pnpm docs:check
```

If public declarations change, regenerate deterministic references:

```bash
pnpm docs:reference
pnpm docs:check
```
