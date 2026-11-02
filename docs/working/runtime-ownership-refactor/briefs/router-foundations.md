# Router foundation ownership

Role: Heavy worker; model gpt-6.1-sol; effort max. No agents or mutating git.
Goal: move actual neutral router compilation/condition evaluation/route choice out of Studio.
Read Current State in ../../runtime-ownership-refactor.md and reports/residual-runtime.md routing row.
Read old runtime/router-runtime.ts and its subject tests; follow Core code-structure rules.
Owned: new engine/automation/router/** and flows/executable/routing execution DTO leaves;
old programs/automation-studio/runtime/router-runtime.ts and its named subject tests.
Owned: canonical route-related parent barrel only flows/executable/routing/index.ts.
Must not touch: service.ts, route-state/**, engine execution-admission/graph/native/output,
candidate-trials, SQL, existing shared admission contracts, root/package barrels or shared docs.
Preserve exact public symbol identities through compatibility reexports, diagnostics/order/clock semantics.
Keep default-subflow projection from Studio artifact in Studio; it is a program adapter.
Split cohesive condition evaluation and execution leaves; one exported authority per leaf, barrels.
Use canonical executable routing DTOs, @fluxiq/contracts/state conditions and canonical run status.
Do not import Studio types through erased imports; narrow unused adaptation policy if needed
without changing legacy callable compatibility. Inspect its actual use before changing it.
Retain old real fixture integration tests; add independent canonical tests without Studio fixtures.
Do not silently repair semantics or change oracles; report defects with reproduction for lead.
Acceptance: focused old/new router tests, isolated strict NodeNext and scoped structure/import closure.
No package/full suite/build/provider/browser/panel actions while other workers edit the tree.
Report: reports/router-foundations.md (under this working-document folder).
End with Outcome, Changed, Validation exact commands/results, Not verified, Report, Notes(max3lines).
