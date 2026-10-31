# P10 trusted control intent: downstream transport

Status: Final source frozen; released targeted rerun passes. Lead owns broader plan-resolution/type/audit and paired acceptance verification.

## Implemented

- Classify each actual binding once through `collectWebLlmControlIntents`; retain its copied annotation beside its private PageTarget. Nothing is added to model packets, wire data, fingerprints or saved identity.
- Track the retained location, document, frame and actual containing-layer source privately. Restore the original annotation with a genuine pre-act identity. A positively selected unrelated B cannot receive A's pre-act identity merely because its address matches.
- Refuse known historical/candidate semantic disagreements through the existing ambiguous-target path. Current exact-page selection keeps its latest actual annotation and normal identity merging, while bare cross-page disagreements still refuse. Reconcile the selected target slots' identities, frames, frame-document paths and intent instead of choosing a permissive annotation.
- Carry the annotation outside parameters through regular targets, handle-bound `$state` fallbacks, Run Output and the narrow host-answer factory. Facts and unrelated parameters contribute none.
- Correlate host absolute targets, including the exact saved `$state.path/fallback` grammar, only with a full exact retained identity, selector and frame match; keep parameters byte-identical. Conflicting outer locator/identity slots or multiple retained sources refuse. Missing positive evidence remains compatible unchanged. Saved/model annotation fields supply no authority.
- Existing repair routing already reconstructs its packet-specific target store from the exact runtime-retained binding. No tools.ts change was necessary. The owning repair test checks original versus later reused numbering and altered/unretained packets.

## Bounded defects authorized by the lead

1. `view-history.find(handle, location A)` formerly returned the newest global B target with A's view/location. History now retains each location's own target, so an explicitly selected historical A supplies both A's executable identity and A's annotation.
2. `actedAs` formerly borrowed A's pre-act identity for B at another source whenever the address matched. A mismatching positively selected B retains its own actual identity and annotation; genuine same-source restoration remains original.

The normal identity-across-view merge, printed/stale/renumbered-handle checks, row identity, permission declarations, trusted effect floors and automatic clearing are unchanged except for refusing known semantic ambiguity and the two bounded wrong-target corrections above.

## Owned files

Downstream paths:

- `domain/src/runtime/llm-evidence/plan-resolution/target-packets.ts`
- `domain/src/runtime/llm-evidence/plan-resolution/resolve-plan-node.ts`
- `domain/src/runtime/llm-evidence/plan-resolution/view-history.ts`
- `domain/src/runtime/llm-evidence/plan-resolution/control-intents/{source,same,absolute,answer,index}.ts`
- `domain/src/runtime/llm-evidence/plan-resolution/control-intents/tests/{host,targets.test,resolution.test,repair.test}.ts`
- `domain/src/runtime/llm-evidence/plan-resolution/tests/{resolve-plan-node,view-history}.test.ts` (strict expected companions and separated historical-conflict/identity oracles)
- `docs/architecture/build-loop.md`

The classifier directory, Core implementation, shared working documents, package/build files, scripts/examples/graphs/oracles/pins, provider/browser state and git were not touched. The paired Core report is this file only.

## Validation

The initial validation hold ended after the lead's final SDK and owning freshness gate passed. The first `pnpm` launch was blocked by PowerShell's pnpm.ps1 execution policy before any test; the native `pnpm.cmd` wrapper was used without changing policy.

`DOMAIN_TEST_BUILD_LABEL=p10-transport-1 pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/llm-evidence/plan-resolution/control-intents/ runtime/llm-evidence/plan-resolution/tests/target-packets runtime/llm-evidence/plan-resolution/tests/view-history.test runtime/llm-evidence/plan-resolution/tests/resolve-plan-node.test` -> Core freshness PASS; 67 tests, 49 passed, 18 failed, 823.0161 ms test duration (8.3558 s command). All 14 new owning intent tests passed. Failures exposed exact-answer expectations needing the declared companion and a production regression: the accumulated accept-to-neutral history incorrectly refused exploration's current coupon controls.

The lead authorized a bounded fix: current exact-page selection uses its latest actual annotation while preserving identity merging; current bare cross-page semantic conflicts and candidate/history conflicts still refuse. A new current-versus-history regression was added, the historical identity test separately proves conflicting history refusal and same-semantics identity merging, and strict answer assertions were updated with independently expected observed annotations. Source was re-frozen before a rerun. Core test moves require a refreshed SDK, so the lead held further checks pending freshness release.

Read-only freeze review found a second conflict hazard: pre-act restoration could erase a bare multi-page conflict when the acted permissive source was newest. The lead authorized the one-line refusal before pre-act restoration and an exact two-page regression. All 16 new owning cases then passed.

`DOMAIN_TEST_BUILD_LABEL=p10-transport-2 pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/llm-evidence/plan-resolution/control-intents/ runtime/llm-evidence/plan-resolution/tests/target-packets runtime/llm-evidence/plan-resolution/tests/view-history.test runtime/llm-evidence/plan-resolution/tests/resolve-plan-node.test` -> Core freshness PASS; 69 tests, 68 passed, 1 failed, 821.6233 ms test duration (9.2983 s command). The remaining failure was this worker's new expected `navigate` for a legacy link fixture that supplied href only inside raw attributes, leaving no actual sanitized href. Both strict expected link companions were corrected to `neutral`; executable identity assertions remain exact. The lead's compiler also found one exact-optional boolean assignment; its authorized shape-only fix writes explicit false rather than undefined, retaining semantics.

`DOMAIN_TEST_BUILD_LABEL=p10-transport-3 pnpm.cmd --filter @fluxiq-web-extension/domain test runtime/llm-evidence/plan-resolution/tests/resolve-plan-node.test runtime/llm-evidence/plan-resolution/control-intents/tests/targets.test` -> Core freshness PASS; 30 tests passed, 0 failed, 563.8101 ms test duration (8.0478 s command). This released rerun covers the corrected adjacent resolver file and every new target/history regression. Source remains frozen for lead verification.

Static final source counts: target-packets.ts 800 lines, resolve-plan-node.ts 779 lines; no baseline allowance was added. No browser/provider calls, package builds or git operations were performed by this worker. Source counts are not runtime validation.

New owning cases cover reused A/B identities and annotations, exact historical source, bare ambiguity, known semantic conflict, original pre-act restoration and caller mutation isolation, wrong location/document/frame/layer/shadow sources, unchanged absolute parameters, absent evidence and forged saved/model fields, multiple-source ambiguity, nested Run Output, handle-bound `$state`, fact exclusion, and exact retained repair packets.

The lead also authorized the bounded exact saved absolute `$state` fallback helper and its byte-identical/absence/conflict/model-refusal oracles; its new owning test passed in both broader worker runs. The corrected current/history boundary and exact expected-companion updates now pass the released targeted rerun.

## Return contract (pending validation)

Outcome: Partial
Changed: Owned downstream source/tests/doc paths above; this report.
Validation: Final released labelled adjacent resolver/target command above -> 30/30 passed; prior broader intent/store/history run 68/69 before the final strict fixture expectation correction.
Not verified: Lead's broader owning plan-resolution run, final typecheck/structure audit, paired Native/Gate acceptance and byte/graph proofs; no browser/provider qualification.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-control-intent/transport.md
Notes: Source/docs/tests are frozen. Await lead release before checks or further source edits. No git operations performed.
