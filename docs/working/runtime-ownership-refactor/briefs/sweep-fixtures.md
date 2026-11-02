# Core full-sweep baseline fixture repairs

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Repair the 14 exactly reproduced pre-refactor Core failures with truthful fixture/protocol updates; preserve every meaningful oracle.
Authoring repo: t843 Core only. Historical t844 Core is read-only production/test baseline except ignored logs/virtual test overlays.
Read: original Core .fluxiq/runtime-refactor-sweep/core-test.log and t844 Core .fluxiq/refactor/core-eight-baseline.log; exact failed subjects and their direct contracts.
Owned test files under programs/automation-studio/runtime: recovery/tests/runtime-exploration-views.test.ts; flow-bootstrap/candidate/tests/trial-gate.test.ts; llm/harness/tests/run-size.test.ts; result-verification/build-test/tests/task-checklist.test.ts; service/candidate-trial/tests/consequences.test.ts; service/end-view/tests/passive-result.test.ts; service/subflow-trial/tests/environment.test.ts; service/candidate-trial/tests/environment/tests/trial-environment.test.ts.
May edit test helpers used exclusively by these subjects after notifying lead. No production edits authorized; if a real product defect or safety-oracle conflict is found, report its cause and exact owning paths for a separate brief.
Must not touch: R3/R4 implementations or their tests, state/recording foundations, context-packer/store, router/model-flow-adaptation, package/config/barrels/audit/shared docs/indexes/other reports. No git/spawn.
Keep over-window requests refused, candidate re-test/repair gates correct, declared consequence floors unchanged, real passive callbacks/current evidence delivered, and environment/reference-time/host object semantics intact.
Read current_view groups instead of historical view references; freeze fresh time for byte-equivalence tests rather than loosening byte comparisons. Replace brittle callback/option identity assertions only with stronger real invocation/receiver/field invariants justified by actual current contracts.
No merely updating expected verdicts/counts to observed behavior. Preserve original safety intent and positive/negative paths. All failures were independently reproduced unchanged before edits.
Use ignored virtual TEST-only overlays against unchanged t844 production while t843 source changes; no changing Core source aliases. Normal t843 targeted acceptance waits for lead's source freeze/build notice.
No providers, paid runs, browser/panel or full suites.
Acceptance: all eight historical overlaid subjects pass with original semantic oracles; exact current targeted run after freeze; report causes and narrow validation honestly.
Report: docs/working/runtime-ownership-refactor/reports/sweep-fixtures.md.
Return: Outcome; Changed; Validation exact commands/results; Not verified; Report; Notes <=3 lines.
