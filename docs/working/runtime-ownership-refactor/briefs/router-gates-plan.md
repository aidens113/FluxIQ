# R6 executable router and runtime gates plan

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Produce an executable, file-partitioned extraction plan for remaining R6 capability owners; no source edits yet.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t842/!FluxIQ.
Read: Current State of ../../runtime-ownership-refactor.md; reports/residual-runtime.md; Core Repository Boundary/code-structure rules.
Inspect only decisive runtime/router-runtime.ts, route-state/**, training-modes.ts, reusable-llm-context.ts, consequence/permission/change/recovery gates and their direct DTO dependencies/tests.
Identify exact implementations that belong engine/router, flow conditions, runtime permissions/adaptation/context; distinguish actual persistence/view adapters.
Produce stable input/output ports and ownership cuts, cycles/order, exact old facade strategy and tests. Avoid canonical Pick<StudioService> or Studio dependencies.
Coordinate R5 shared-state plan by reference; do not duplicate DTO declarations. Active browser interpretation is downstream-only and needs explicit trusted host ports.
Owned report only: docs/working/runtime-ownership-refactor/reports/router-gates-plan.md.
Must not touch source, shared working docs, indexes, other reports. Never git mutation/spawn.
Acceptance: plan concrete enough for bounded next implementation with named files/contracts/checks; no broad test runs.
Return: Outcome; Changed; Validation; Not verified; Report; Notes <=3 lines.
