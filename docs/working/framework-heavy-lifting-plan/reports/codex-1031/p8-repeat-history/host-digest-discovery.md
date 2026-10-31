# Web state digest and host capture discovery

## Finding

The downstream domain already owns the semantic web-page digest: domain/src/runtime/llm-evidence/state-digest/state-digest.ts exports webLlmStateDigest(WebLlmPageEvidence): string (v7). It is a deterministic, opaque equality token, computed from sanitized evidence. The native host captureStateSnapshot does not currently return or expose that digest in its typed snapshot ref or summary. Its capture path returns a model-readable summary plus capture IDs, timestamps and an optional reset token.

## Digest inputs and stability

In state-digest.ts (pageProjection, elementProjection, frameRanks), the digest covers screened location and title; shown elements sorted as complete projected records; visible dialogs and blockers; and frame topology. Element projections include tag, semantic names/text, control/input types, click-handler presence, field values/check/selection/options, link target, reveal/expanded state, form/landmark/heading/group, item/cell position, and overlay/blocking state. Password-like sensitive controls are refused upstream by the sanitizer. The final digest is web-state.v7:<length>:<FNV-1a>; it cannot be decoded to page text. FNV-1a is explicitly an equality checksum, not a cryptographic integrity boundary.

The projection intentionally excludes capture/handle noise: generated target and parent handles, browser frame IDs (child frames become ranks among shown child frames), ordering of controls, timestamps, viewport/scroll/boxes, navigation/loading/selection, capture truncation flags, and interaction-stamped focus/recent/changed fields. Tests confirm unchanged-page repeatability, shown value/control changes, order independence, hidden controls excluded, scroll independence, and child-frame renumbering independence. Frame grouping and moving controls between top document and child frame still change the digest. Accordingly this digest can treat a pure shown-control reorder as unchanged by design.

The evidence trust label is a constant untrusted-page-evidence, and is omitted from the hash; it means page text is untrusted input, not that the capture is complete or authoritative. The digest also omits truncated, captureTruncated, and unanswered-frame IDs. Therefore equality alone does not prove complete observation. A missing/partial capture can digest equal to a complete one. The host producer must withhold the digest unless sanitized evidence proves the relevant capture complete; at minimum reject truncated, captureTruncated, and nonempty frame.unansweredFrameIds. A thrown/unreadable snapshot already yields no ref rather than fabricated evidence. Whether other incompleteness markers exist should be checked at implementation time; do not infer completeness from a valid digest string.

## Native capture seam and scope

In domain/src/runtime/host-runtime.ts, captureStateSnapshot dispatches web.dom.capture_snapshot, sanitizes it with sanitizeWebLlmSnapshotWithBindings, and builds summary from publishedWebLlmPage(packet), plus documentTimeOrigin, option groups and result count (around lines 227–286). That is the smallest place to produce the existing digest: use the exact sanitized binding.evidence before projection/summary, via the existing exported webLlmStateDigest; do not reimplement hashing or hash summary (a different projection). For previousStateRef, the host returns the exact prior snapshot object, so separate digest metadata would naturally be preserved without recapture.

The browser host capture is a merged page snapshot (target observation requests merged/top frame); the digest covers the top document and all shown child-frame controls represented in that merged packet, with stable frame ranks. It does not encode browser frame IDs. The digest covers URL/content but not session ID, tab ID, source ID, document time origin, stateSnapshotId, stateRef, attempt ID, or capture time. Host gateway metadata carries sessionId for reset-resource/target bookkeeping, while summary documentTimeOrigin is separately used by state diff. Therefore two tabs with the same URL and equivalent shown content can have the same digest. Core may use equality only within the same held host resource/capture lineage; if it cannot establish same-scope observations, it must treat equality as unknown.

Core's public AutomationStudioHostStateSnapshotRef (Core packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts, first 115 lines) has stateSnapshotId, stateRef, capturedAt, optional summary, and from; there is no typed semantic digest or evidence-completeness field. Storing a digest in summary would mix machine metadata into the model-facing page view. The clean optional contract is a separate typed field, for example stateDigest, with Core comparing only two present digests from a known same scope. Absent digest means unknown/legacy behavior. No digest must be synthesized from a partial summary.

## Recommended downstream producer and tests

Smallest downstream producer/wiring: in domain/src/runtime/host-runtime.ts, import the existing digest owner from ./llm-evidence/state-digest; compute only from binding.evidence after a completeness gate; attach it as dedicated snapshot-ref metadata once Core adds that typed optional field. Preserve the current summary, reset token, state IDs and reuse behavior.

Owning focused tests:
- domain/src/runtime/llm-evidence/state-digest/tests/state-digest.test.ts: digest determinism and semantic sensitivity.
- .../tests/hidden-elements.test.ts: search/look visibility equivalence and viewport omission.
- .../tests/frame-identity.test.ts: frame renumbering and grouping.
- domain/src/runtime/tests/host-runtime.test.ts: snapshot capture, previous-ref reuse, malformed/unavailable capture behavior. Add focused host tests for clean digest propagation, withheld digest on truncation/unanswered frames, missing digest on capture error, and preserving digest on reused prior refs.

state-digest/tests/call-state-digests.test.ts verifies the same owner is used by LLM call captures and that unreadable/no-page calls report no state; it is not the native host snapshot seam.

## Gaps and limits

The digest has no cryptographic collision guarantee and intentionally ignores reorder-only changes. More critically for an unchanged-execution guard, current digest code does not itself certify capture completeness or resource scope. The host/Core contract must carry those facts through explicit presence/scope rules; unknown or withheld evidence cannot count as unchanged. This was source inspection only; no checks or runtime behavior were exercised.

