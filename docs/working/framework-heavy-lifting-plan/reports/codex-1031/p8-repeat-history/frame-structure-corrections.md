# Frame/browser statement formatting corrections

Outcome: Done
Changed:
- apps/extension/src/background/connection/tests/dom-snapshot.test.ts
- apps/extension/src/background/tabs.ts
- apps/extension/src/runtime/tests/look-across-frames.test.ts
- apps/extension/e2e/site-reset/tests/runtime-repeat/tests/native.spec.ts

Read the lead's t829-down-phase2-audit.log and unpacked each reported owned
statement line: the five snapshot test callbacks, native API absence branch,
four runtime test callbacks (including the existing baselined helper), and the
browser observation unavailable/reason increments. Only whitespace/line breaks
and expanded braces changed; statement order, values and assertions remain.
Read back the affected authored source sections. Files frozen for lead checks.

Validation: not run (brief prohibits tests/builds/audits; source inspection only).
Not verified: post-format compilation, tests, structure audit and browser behavior.
Lead previously reported 59/59 owning frame selections passed before this
formatting-only follow-up; that is a lead claim, not a worker rerun.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/frame-structure-corrections.md
Notes: No source beyond four owned files, no Core/shared-doc/baseline/git/runtime
state edits. No new file required; snapshot test remains below hard file budget.
