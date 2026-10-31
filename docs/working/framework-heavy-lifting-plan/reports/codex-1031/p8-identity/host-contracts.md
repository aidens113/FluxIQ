# P8 private web interfaces

Outcome: Done. Assigned interface source is now frozen for lead review and the two dependent production workers. No adapter, matcher, capture population, re-keying or other runtime behavior was implemented. No checks/builds/tests/audits or runtime/API calls were run.

## Exact files and anchors

Paths are relative to the private downstream `!FluxIQWebExtension` tree.

| Path | Anchor | Assigned interface change |
| --- | --- | --- |
| `domain/src/runtime/target-reacquire/identity/scope.ts` | 2 | One exported `WebTargetScope` type; absent optional claims remain unknown. |
| `domain/src/runtime/target-reacquire/identity/provenance.ts` | 4 | One exported `WebTargetCaptureProvenance` type. |
| `domain/src/runtime/target-reacquire/identity/observation.ts` | 5 | One exported `WebTargetObservation` type, extending private provenance. |
| `domain/src/runtime/target-reacquire/identity/fresh-target.ts` | 4 | One exported `WebFreshTarget` type using the existing fingerprint. |
| `domain/src/runtime/target-reacquire/identity/record-identity.ts` | 4 | One exported `WebTargetRecordIdentity` alias to the existing record schema. |
| `domain/src/runtime/target-reacquire/identity/refresh-result.ts` | 5 | One exported `WebTargetIdentityRefreshResult`, deriving all non-found outcomes from Core. |
| `domain/src/runtime/target-reacquire/identity/index.ts` | 1 | Type-only re-exports of the six leaves. |
| `domain/src/runtime/llm-evidence/sanitize.ts` | 39, 112, 114, 301 | Two type-only leaf imports, optional private binding fields and explicit `undefined` entries in the existing exhaustive `present<WebLlmSnapshotBinding>` builder. No population or public evidence change. |

## Frozen complete shapes

```ts
export type WebTargetScope = {
  kind: "single-frame" | "merged";
  sessionId?: string;
  browserTabId?: number;
  browserFrameId?: number;
  browserFrameUrlPath?: string;
  resetResource?: string;
  location?: string;
  timeOrigin?: number;
};

export type WebTargetCaptureProvenance = {
  scope: WebTargetScope;
  coverage: "complete" | "partial" | "unknown";
  includesHidden: boolean;
};

export type WebTargetObservation = WebTargetCaptureProvenance & {
  page: WebLlmSnapshotBinding;
  samePlace: "yes" | "no" | "unknown";
};

export type WebFreshTarget = {
  selector: string;
  element: WebAutomationElementFingerprint;
  hidden: boolean;
};

export type WebTargetRecordIdentity =
  NonNullable<NonNullable<WebAutomationElementFingerprint["context"]>["record"]>;

export type WebTargetIdentityRefreshResult =
  | { outcome: "found"; target: WebFreshTarget }
  | Exclude<AutomationStudioUnboundTargetReacquireAnswer, { outcome: "found" }>;
```

The result's exact expanded non-found alternatives, as frozen by the current Core answer, are:

```ts
| { outcome: "gone"; coverage: "complete" }
| { outcome: "unmatched"; reason: "ambiguous" | "unidentifiable" }
| { outcome: "unavailable"; reason:
    "observation_unavailable" | "observation_incomplete" |
    "place_unproved" | "unsupported_target" }
```

The downstream source imports that union rather than duplicating those reasons. Found carries `target`, not Core patches: native/authoring adapters alone turn the target into their per-attempt dispatch representation. A fresh target contains no handle. The existing record alias retains `key`, `keyAttribute`, `text` and `values` with their original optional field types; no record schema was copied.

The exact additions to `WebLlmSnapshotBinding` are:

```ts
recordIdentities?: Map<string, WebTargetRecordIdentity>;
captureProvenance?: WebTargetCaptureProvenance;
```

Both are private binding fields, outside `WebLlmPageEvidence`. Their keys/data must not enter model evidence, a durable Flow or a trace. The existing sanitizer builder explicitly writes `recordIdentities:undefined` and `captureProvenance:undefined`; `present` omits them as before. Existing or hand-built bindings remain valid without them, and missing metadata proves neither completeness, hidden coverage nor the same place.

## Imports and dependency direction

- `scope.ts` has no imports.
- `provenance.ts` imports `WebTargetScope` from `./scope` with `import type`.
- `observation.ts` imports `WebLlmSnapshotBinding` from `../../llm-evidence/sanitize` and provenance from `./provenance`, both type-only.
- `fresh-target.ts` and `record-identity.ts` import the existing fingerprint from `../../../actions/types`, type-only.
- `refresh-result.ts` imports the public Core `AutomationStudioUnboundTargetReacquireAnswer` from `fluxiq/automation-studio` and the fresh-target leaf, type-only.
- `sanitize.ts` imports provenance and record identity directly from `../target-reacquire/identity/provenance` and `../target-reacquire/identity/record-identity`, type-only. It does not import the observation/barrel back at runtime.

The possible binding/observation cycle is entirely in types. No new runtime barrel dependency, package subpath or public Core export was introduced. `target-reacquire/index.ts` was not edited; dependent workers can import the private identity barrel or leaves.

## Required semantics for dependent implementations

An optional scope claim is unknown when absent. In particular, absence of `browserFrameId` does not assert top frame 0; absence of timeOrigin does not assert the same document; a frame URL path is a constraint, not proof of document identity. `resetResource` is the existing opaque session plus full tab/frame resource identity. `sessionId` is retained privately so a later observation can target the same gateway session rather than selecting whichever client is eligible now. Populate browser IDs/session only from the correlated trusted gateway/browser result, never from page-supplied identifiers.

`coverage:"complete"` asserts a whole settled observation of the stated intended scope. It does not assert that all paginated/virtualized data or other frames were searched. A missing/partial/malformed observation cannot prove uniqueness or absence. `samePlace:"unknown"` must produce `unavailable/place_unproved`, not found or gone.

`includesHidden:true` requires positive proof that the actual supported producer honors the requested hidden capture. The inspected current producer chain already supports it: `shared/snapshot-capture-options.ts` reads the strict true flag, `content/actions/capture-snapshot.ts` passes it to the capture, and `runtime/look-across-frames.ts`/the background merge forward it to frames. This source-level support plus a known installed current producer can justify the claim for the provider-free installed-artifact proof. Merely sending the option to an unknown/older paired producer does not prove it was honored; no response acknowledgement or new capability was added here. If an existing trusted producer/version contract does not establish support, leave `includesHidden:false` and coverage unknown/partial as appropriate. False intentionally means no hidden-absence claim, not proof that hidden elements were omitted. Do not invent a protocol flag or infer hidden coverage from finding zero hidden elements.

The production source should retain structured record provenance while it still holds the accepted raw descriptor, screen it with the existing rules, then explicitly carry/re-key the map in capture/stable-handles. Do not parse the opaque existing `records` address strings. A frame-only capture must be remembered as scoped/additive, not erase an earlier merged page view. None of that population/storage behavior was implemented in this phase; other exhaustive binding constructors may need explicit new field entries in the dependent phases before type validation.

## Resolved boundary and child provenance plumbing

Core planner confirmed the existing `runtime/executor/node-execution/attempt.ts:138` before-action boundary receives the actual resolved `executionNode`; its implementation will retain that after parameter-overlay application/floor validation. This planner did not re-run or independently validate that execution path. The lead confirmed the same source reading. The new Core request passes isolated `previousAttempt:{attemptId,beforeAction?}` using the prior trace's stateRefs.beforeAction.

That supports a small native-only follow-up: read the actual direct or canonical wrapped output parameters from the execution node at before_action, capture an explicitly addressed child when one is involved, and store its private `WebTargetCaptureProvenance` separately under the correlated `(attemptId,stateRef)` with that child's session/tab/frame/location/timeOrigin. The ordinary merged/global summary and its top-document identity remain unchanged. A reused top summary can reuse only its own top provenance; it cannot be relabelled as a child observation. The child entry must correspond to the current attempt even when before_action reuses a previous top ref. A bounded private memo owner, not these data types, owns eviction and paired-key validation.

At recovery compare the fresh scoped child capture against that real prior child entry. Default merged-top before evidence proves the top session/tab/document only; a child ID/path alone does not prove that the child has not navigated. If the resolved scope cannot be extracted at that boundary, a child read fails/returns partial, hidden support is unproved, or the paired memo entry is absent/evicted, answer unavailable with the appropriate closed reason. Require direct tests for both successful correlated child provenance and the unknown-child path. No new Core request field, browser wire action, top-summary overwrite or guessed navigation is required.

## Freeze and verification boundary

Only the seven new identity type/barrel files, assigned portions of sanitize.ts, and this report changed in this phase. The lead-written failing regressions, all implementations/tests, Core API, versions, capture.ts/stable-handles.ts/elements.ts/from-packet.ts, output descriptors, memo/adapters, baselines and shared working documents were untouched. No checks were run; type compatibility and runtime behavior remain for the lead and dependent workers to verify after implementation. Source is frozen now.

Outcome: Done
Changed: seven new private identity type/barrel files; assigned sanitize.ts interface/undefined fields; report only
Validation: not run (interface-only brief forbids checks/builds/tests/audits)
Not verified: types/runtime/SDK/browser; no implementation acceptance claimed
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/host-contracts.md
Notes: Source frozen. Public Core non-found outcomes are reused verbatim through a type alias. Same-place/child/hidden claims remain unknown without positive supported capture provenance.
