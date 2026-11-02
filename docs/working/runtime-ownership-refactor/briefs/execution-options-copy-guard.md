# Enforce original execution option copies
Role: Heavy worker; gpt-6.1-sol, Max. Source release only for exact files below.
Goal: implement fail-build typed guard against object-spreading actual graph execution options and losing private companions.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ; downstream sibling is mirror target.
Read Current State, Core code structure, existing context/rule/test conventions, new CONFIG.executionOptionsCopy fields (lead-frozen).
Read ignored prototype .fluxiq/refactor/options-copy-discovery.mjs and JSON: 35 findings incl2 approved helper spreads + test fixtures.
Own new scripts/structure-audit/rules/execution-options-copy.mjs and adjacent tests/execution-options-copy.test.mjs in Core FIRST, then byte-identical downstream copies.
Must not touch config, context, other rules/tests, source callers/helper, package.json, baselines, shared working docs, git.
Use actual TypeScript type/symbol declaration identity, not variable/property names or executable metadata. Follow unions/intersections/alias arguments and import aliases.
Load configured tsconfig options/source aliases; restrict inspected roots to configured from paths with spreads. No full diagnostics, emit, providers or builds.
Only original configured copy implementation is allowed; source under tests/e2e roots is excluded by testRootDirNames, including fixture helpers; real ship support outside tests is checked.
Fail closed on missing owner/config/type resolution; do not silently pass an empty inspected scope or mask compiler errors as no findings. Keep fast unset-config no-op for downstream.
Finding ratchet:false, source line + exact expression, remedy copyAutomationExecutionOptions; guard grants no execution rights.
Handle source options optional/Partial and nested alias forms; avoid flagging ordinary unrelated JSON/settings spreads or fresh option literals without graph-option spread.
Meaningful real compiler fixtures: original graph type, renamed import, optional/property access, Partial/intersection/Readonly, ordinary data negative, exact helper-only exemption, test fixture exclusion, missing declaration/config closed.
No need to make current production findings pass: C will migrate callers; report actual remaining paths without changing baseline.
Run exact Node tests and scoped rule only; no full sweep.
Own report: docs/working/runtime-ownership-refactor/reports/execution-options-copy-guard.md.
Return Outcome, Changed, Validation, Not verified, Report, Notes<=3 lines.
