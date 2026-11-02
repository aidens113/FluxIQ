# Current foundations acceptance

Role: heavy worker, gpt-6.1-sol, Max.
Goal: validate current t843 production and repaired fixtures after the normal Core library build.
Core: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ.
Downstream: sibling !FluxIQWebExtension.
Read Core reports/sweep-fixtures.md and briefs/sweep-fixtures.md; downstream reports/downstream-sweep-regressions.md.
Own only reports/current-foundations-acceptance.md in this Core working-document directory.
Must not touch source, tests, configuration, manifests, shared documents or git.
Run the exact eight Core fixture files/69 cases; three unchanged candidate-retest failures are known.
Run downstream domain build/check and the seven repaired subjects/31 cases plus 52 closest safety cases.
Use current normal package runners, never historical overlays or cache bypasses.
Coordinate domain build ownership with execution_architecture, who builds runner dependencies.
No whole suites, providers, browser, panel or real user data.
Capture logs only under ignored .fluxiq; report actual commands and observed counts.
If unexpected failures occur, report them without changing source.
Return Outcome, Changed, Validation, Not verified, Report and at most three Notes lines.
