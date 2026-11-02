# Candidate retest protocol repair design

Role: Heavy worker, gpt-6.1-sol, max effort.
Goal: Design the smallest structural repair for the three preexisting candidate-gate repeat failures, preserving uncertain-act protection.
Read: Current State; sweep-fixtures.md report; actual trial-gate producer, candidate authoring-loop wiring, repeat outcome/decision routing and strict retry-later contracts.
Owned REPORT ONLY: docs/working/runtime-ownership-refactor/reports/candidate-retest-protocol.md. No source changes before lead reviews design; all current tests/source stay frozen for integrated checks.
Consider a trusted per-loop, one-use gate re-entry authority bound to exact candidate revision/digest and completed-trial ordinal/remaining budget. It authorizes reaching the admission gate, never bypassing trial/reset/permission/unknown-lasting-effect checks or dispatching an act.
Authority must be Core-issued, scoped, and consumed once; no model/JSON/resultReason/tool-name-only bypass, fake unacted metadata, broad repeat exemption, or renewable refusal loop without actual progress/trial budget consumption.
Keep strict domain transient/unacted retry unchanged. Preserve existing three retest oracles and max trials; a repeated refusal must remain bounded. New/fresh revision, stale receipt, exhausted allowance, uncertain lasting act, successful final verdict and forged result flags need explicit outcomes.
Trace actual beforeTrial/reset/trial permission and uncertainty checks; prove re-entry cannot repeat an unresolved lasting act. If safe re-entry cannot be distinguished with current ports, identify the exact narrow additional facts/authority required; do not assert safety from comments.
Prefer a generic capability in runtime/agents where warranted, with candidate-specific issuance/composition in the authoring owner; no canonical Studio import.
Provide exact files/ports/ownership, unchanged invariants, adversarial test cases and narrow acceptance commands. No helpers outside the brief, providers, browser, full suites, git or spawning.
Return: Outcome; Changed; Validation; Not verified; Report; Notes <=3 lines.
