# Saved examples: actual production evidence resolution

Outcome: Done (source only). Source frozen for lead checks. No tests, types, builds, audit, browser/provider calls or git operations ran.

## Missing phase corrected

The original migrated save helper validated raw authored `tN`/`extraction.N` plans. Production candidate submission first calls public Core `resolveAutomationStudioFlowBootstrapPlanParameters`, which resolves fact targets and then nodes through the bound domain. Only its resolved plan enters strict plan validation and graph normalization.

`saved-flow.ts` now performs that actual public resolution phase before the unchanged strict validator -> public normalizer -> every saved graph validator sequence. It refuses unresolved plans before normalization.

## Honest unit evidence and real callbacks

- Added `evidence-manifests.ts`: eleven explicit synthetic unit page manifests keyed by the exact Example heading. Their target document positions, concrete selectors, element kinds/names and detection field sets are authored independently of the parser. No script scanning manufactures evidence. Each example has a fresh scope/store instance, so unrelated reused tokens cannot accidentally share identity.
- Added `resolve-evidence.ts`: passes synthetic snapshots through actual `sanitizeWebLlmSnapshotWithBindings`; checks each known target token corresponds to its explicit manifest selector; seeds actual `createWebLlmTargetPackets().remember`; reserves/retains actual extraction handles through `createWebLlmExtractionHandles` with concrete list item/field requests and the catalogue pager. Gaps in target numbering are unrelated captured page text. An extraction.2 example reserves the first slot before its actual second detection.
- Public Core resolver receives the actual web registry, explicit `handlesIssued`, `writtenByModel` and `view_history` options. Its binding delegates all node/fact questions to actual Down `resolveWebPlanNodeParameters` with those stores. No callback manufactures resolved parameters or fake capabilities. A deterministic unit permission check grants the authored declarations; nothing dispatches a real action.
- The target/fact and extraction store owner APIs are imported from Down owning barrels; all Core imports are from public `fluxiq/automation-studio`. No private Core source import, added public export or production change.

## Oracles preserved

All raw authored parse/accept/graph/edge/row/consequence/state/callable/writer tests remain unchanged. Four byte/hash pins and full completion digest remain unchanged. Saved scope/id/output/router/role/requirements assertions remain unchanged.

Two saved fact assertions now expect their manifest-provenance concrete target instead of an unresolved handle: permit entry t6 and shared booking-success t11. Their exact target identity expectation is independently built from the explicit manifest, never read from the resolved plan. The original authored handle oracles remain in `state.test.ts`.

Added three negative regressions: raw member target, catalogue extraction, and permit entry/fact resolution all fail with `web.handle.unknown` when the same real stores have no issued source evidence. A missing source cannot silently fall through to saved validation.

## Paths / limits

Added Down tests `evidence-manifests.ts`, `resolve-evidence.ts`; updated `saved-flow.ts`, `saved.test.ts`, `index.ts`. This own report only in Core. No other paths changed for this follow-up.

No selector requiredness, action schema, production examples, grammar, metadata, pins or validators changed. These tests prove compile/save acceptance with synthetic unit evidence, not browser action execution or that an example's synthetic site exists. Subflow schema acceptance remains the previously agreed Core actual-builder/Down-pins compositional split.

Validation: not run; brief prohibits checks/builds/audits. Source reads and edits only.
Not verified: TypeScript compilation, all eleven resolver/save outcomes, negative outcomes, structure audit, browser/provider behavior. Lead owns owning examples tests, package types and structure audit against the current SDK.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit3-saved-resolution.md
