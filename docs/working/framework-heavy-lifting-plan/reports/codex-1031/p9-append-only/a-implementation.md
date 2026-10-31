# P9 A immutable evidence projection ? frozen source report

Outcome: Done (source implementation only; lead acceptance pending)

## Exact shape
- Each present declared historical member retains its original property position and becomes `{"core.view_reference":{"callId":"<original>","group":"<identity>"}}` from its first appearance.
- Group identities: `top`; `holder:<holder>`; separate `tool:core.recall_result:restored` for Core recall answers.
- Non-view members and holder metadata stay whole, in their original order. The legacy exported `AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY = "supersededBy"` remains available but is never emitted by the new projection.
- One appended entry has `callId` and `toolId` `core.current_view`, with value `{groups:[{group,callId,holder?,value:{<every present declared member whole>}}]}`.
- Groups appear in declaration-reader order, followed by recall; each latest whole group appears once. A missing member is not invented; empty arrays/null replace a group's earlier value. Page-only updates do not replace held rows.
- Overlapping top holders remain independently grouped: their nested declared members become stable references inside the top tail payload, and only the independent held tail carries the whole nested payload. Other holder metadata stays whole. No reader/registry normalization was added.
- Tail order: immutable history, current view if present, current Flow if accepted, then existing history/draft/budget entries. No declared keys means no invented client view or recall projection.
- Raw records are untouched for recall/execution. Current Flow selection reads raw records and keeps accepted/refused semantics.

## Ownership changes
- `llm/context-window.ts`: replace future-successor rewriting with immutable projection; retain current Flow implementation and legacy symbol.
- `llm/decision-context/current-view.ts`: new cohesive projection/full-tail helper.
- `llm/decision-context/index.ts`: export helper.
- `llm/decision-context/shown.ts`: correct tail-order/projection comments.
- `llm/tests/context-window.test.ts`: remove obsolete successor-rewrite expectations; retain no-view/full-context/current-Flow/provider-limit oracles.
- `llm/tests/context-window-append-only.test.ts`: new equivalent/stronger projection oracles for first-result references, every historical UTF-8 byte, original order/non-view metadata, raw frozen input, latest full page/rows once, interleaving, missing/empty/null, recall, overlap through page-only/metadata/row replacements, large uncapped payloads, long-build size, Flow and all tails.
- `view-groups.ts` and its existing tests unchanged; existing reader reused.

## Validation boundary
- No checks, builds, audits, provider/API/browser calls or git commands run, as brief requires.
- Source frozen for combined owning tests, types and structure acceptance by lead.
- No test success or live behavior claimed. E must replace successor-reference wording and assert serialized provider-message UTF-8 prefix behavior.

Outcome: Done
Changed: context-window.ts; decision-context/current-view.ts,index.ts,shown.ts; tests/context-window.test.ts,context-window-append-only.test.ts; this report
Validation: not run ? worker source gate prohibits checks/builds/audits; lead runs combined acceptance after freeze
Not verified: compilation, owning tests, structure audit, provider-message integration, live behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/a-implementation.md
Notes: Source frozen. No out-of-ownership source edits. No source success inferred from inspection.
