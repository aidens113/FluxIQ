# Web boundary closure discovery

Read-only source discovery for the paired t843 tree. This identifies the finite residual work; it does not claim runtime acceptance.

## Finding

The browser target/recording ownership move is already wired through the downstream implementation bundle. I found no active Core target normalizer, selector/URL matcher, or recording-packet interpreter left in the named Core modules. The finite remaining active browser interpretation found in scope is `automationStudioLlmStepLogPageText`, which searches arbitrary evidence objects for the first string-valued `page` field breadth-first (through depth four) and persists that text as `page.txt`. Its caller is Core step-log formatting, so the extraction belongs in an explicit web-domain evidence-summary capability; generic log formatting and persistence remain Core-owned.

## Target and recording closure evidence (already moved; no new move indicated)

- Core `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` declares the persisted target/fingerprint/candidate/selection DTOs. Its comments explicitly make browser fields opaque. `model/index.ts` exports the DTO; `model/actions.ts` imports its type. `runtime/llm/model-facing/control-words.ts` only mentions the DTO in a comment. Searches found no active target normalization/scoring caller in this Core model path.
- Downstream `domain/src/target-normalization/**` owns normalization. Existing use sites include `domain/src/output-nodes/target-preparation/prepare.ts` and `domain/src/output-nodes/native-runtime.ts`; recording conversion/policy is imported by the same implementation bundle from `target-normalization` and `recording/web-state`.
- `domain/src/output-nodes/native-runtime.ts` creates the web matcher, registers `outputTargetPreparer`, `recordingCandidateParameterNormalizer`, `recordingEntryTargetPreparer`, and `recordingTargetPolicy` in the implementation bundle. The prepared target callback is consumed by Core generic `fluxiq/runtime/output-dispatch/preparation` through `domain/src/output-nodes/target-preparation/prepare.ts`.
- `domain/src/recording/web-state/action-target.ts` and its barrel `domain/src/recording/web-state/index.ts` project captured element-state into web action targets. Active callers include `domain/src/recording/web-state/snapshot.ts`, `domain/src/client/gateway-mapping.ts`, `domain/src/client/browser-result-mapping.ts`, and extension background `apps/extension/src/background/connection/gateway-payloads.ts` / `server-command-channel.ts`.
- `domain/src/element-fingerprint/**` owns web scoring; extension `apps/extension/src/content/identity/score.ts` imports `createWebElementMatcher` through `@fluxiq-web-extension/domain/client`. `domain/src/output-nodes/native-runtime.ts` also registers it for generic matching. These are concrete web consumers, not merely contract mentions.
- Existing local regression paths include `domain/src/target-normalization/tests/**`, `domain/src/output-nodes/target-preparation/tests/prepare.test.ts`, `domain/src/output-nodes/target-preparation/tests/bundle.test.ts`, `domain/src/recording/web-state/tests/action-target.test.ts`, `domain/src/element-fingerprint/tests/**`, and `apps/extension/src/content/identity/tests/**` (exact suite selection should be confirmed during implementation).

## Finite remaining page-text extraction move

Core active source and caller chain:

1. `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/page-text.ts` — `automationStudioLlmStepLogPageText(evidence)` is the active interpreter. It traverses arbitrary objects and arrays breadth-first up to `MAX_DEPTH = 4`, choosing the shallowest first string property named `page`.
2. `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/tool-step.ts` — calls the interpreter on `evidence` and writes the returned value to `page.txt`; keep step folder, JSON/meta/index handling and best-effort persistence here.
3. Actual production entry: `packages/fluxiq/src/programs/automation-studio/runtime/service.ts` wraps the observed tool with `automationStudioLlmStepLogTool` during Flow draft dry-run tests. Other production wrappers are `runtime/llm/evidence-progress/progress-trace.ts` and replay/caller `runtime/llm/node-tools/tests/replay-span-step-log.test.ts`; test-only calls exist under `runtime/llm/step-log/tests/**`.
4. Core behavior regression: `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/tests/tool-step.test.ts`, especially the test that supplies `{ value: { page: { schemaVersion: "web-llm-page.v3", page: PAGE } } }` and expects `page.txt` to equal `PAGE`. Existing tests exercise output shape through the caller but do not separately prove BFS ordering/depth behavior.

Downstream has a natural domain owner, but not an existing equivalent extractor: `domain/src/runtime/llm-evidence/page-view/**` builds and exports the web page view (`web-llm-page.v3`) and `domain/src/runtime/llm-evidence/**` parses/projects its evidence. Its existing `untrusted-json.ts` `pageText` helper reads a string value; it does not search arbitrary evidence for a nested page view. `domain/src/actions/extraction/summary.ts` summarizes extraction outcomes and is unrelated to this page view. Avoid placing the new function in that extraction summary or making it a general prompt hook.

Recommended finite seam for implementation: add a named evidence-summary operation within `domain/src/runtime/llm-evidence/` that accepts the actual tool evidence contract and returns the compact page string (or undefined); export it through the existing runtime/client entry points as required by callers. Core step-log can receive/invoke that domain capability from the owning service integration while retaining all generic log rendering and disk code. If the seam requires the registered web implementation bundle, pass the explicit domain function/callback there; do not infer a web parser from arbitrary generic objects. Add the behavioral matrix for no page, nested canonical page view, competing shallow/deep pages, arrays, and the supported depth/bounds in the new owner-local `domain/src/runtime/llm-evidence/tests/` test. Preserve the existing Core `tool-step.test.ts` end-to-end logging expectation. Exact function signature and registration path need to be fixed before implementation; this discovery does not choose an arbitrary injectable prompt callback.

## Classification boundaries

Do not count the following as residual violations based on name/field matches alone: the neutral persisted target DTO and historical selector/URL/browser fields; generic target matching that calls the registered matcher; extension-created page packets passed as evidence; domain's page-view writer; literal model examples; unrelated structured extraction summaries; and generic URL/runtime navigation handling. The evidence above is caller/import based. I did not run tests, builds, typechecks, browser/provider runs or git commands.

## Confidence and limits

High confidence on the named page-text function's live Core caller and current downstream target registration path. High confidence that the checked Core target DTO is passive and the web scorer/recording projection has actual downstream consumers. Medium confidence that the page-summary operation should live under `runtime/llm-evidence`; the domain boundary is clear, while its package export/registration shape depends on the agreed Core-to-domain integration. Searches were scoped to the paired source trees and named modules; this is not a complete static import graph and does not prove absence of reflective/dynamic callers or runtime behavior.

Outcome: Done
Changed: `docs/working/runtime-ownership-reset-plan/reports/web-boundary-closure.md` only.
Validation: Read-only `rg`/source inspection -> active `page-text.ts` caller and downstream registration/consumer paths identified; no tests/builds run per brief.
Not verified: Runtime behavior, complete typed/dynamic import closure, implementation or compatibility of the proposed evidence-summary seam, all features' browser acceptance.
Report: `docs/working/runtime-ownership-reset-plan/reports/web-boundary-closure.md`
Notes: Target normalization, output preparation, recording projection, and web fingerprint scoring appear moved and wired; one active generic page-text interpreter remains.
