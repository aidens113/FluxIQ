# Recording indexing implementation

Role: heavy worker, gpt-6.1-sol, Max.
Goal: move actual recording index/link/build/lookup algorithms into canonical owners.
Read reports/recording-extensions-plan.md and Current State of the paired working document.
Do not begin before lead explicitly releases the current acceptance/source barrier.
Own contracts/src/recording/indexing/** and fluxiq/src/runtime/recording/indexing/**.
Own old Studio storage/state-index.ts, runtime/state-linker.ts and service/recording-state-index/{build,lookup,entry-readings,state-entry-readings,contracts,policy}.ts plus their immediate tests.
Own new Studio storage/recording-index-policy/** and exact old feature-barrel adjustments needed by those files.
Lead owns package exports, canonical parent barrels, architecture/shared documents, config and git.
Do not touch SDK/native, gateway/IO, mapper, service.ts, model/flow-adaptation, admission, or other worker source.
Freeze the exact two policy contracts from the plan; use existing rich state/recording authorities.
Keep one schema authority, deterministic sorting, whole metadata, stable links and original object-reference diagnostics.
Keep object:// and same-project interpretation in the Studio policy; generic algorithms require explicit policy.
Move actual implementations, not wrappers back into Studio; exact old public names remain compatible.
Storage loading/hydration/repair/locks stay Studio. No new browser semantics or baseline exceptions.
Tests must preserve old complete projections and compare legacy/canonical results, invalid/cross-project refs and chronology ties.
Run narrow affected tests and isolated strict typecheck; no whole suites, providers, browser, panel or user data.
Report contracts/ports and new exports needed by lead, exact commands/results and unverified integration.
Own report: reports/recording-indexing.md. Freeze source at handoff.
Return Outcome, Changed, Validation, Not verified, Report and at most three Notes lines.
