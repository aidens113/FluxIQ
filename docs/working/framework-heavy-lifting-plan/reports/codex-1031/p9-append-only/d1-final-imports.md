# D1 final owning-import follow-up

Source status: **FROZEN** before this report. No checks, tests, builds, audits, browser/provider/panel or git operations run.
Read the actual `test-runs/t830-d1-audit-3.log`: the six module-cycle findings were resolved; its only failures were three formerly cycle-exempt deep imports that now need their owning barrels.

Approved import-only changes:
- `node-run/handle-shape/with-handle-shape.ts`: `WEB_LLM_EXTRACTION_HANDLE_PATTERN` now imports from `../../structure`, which already re-exports the same handles constant.
- `node-run/press-effect/acted-on.ts`: `webLlmItemRow` now imports from `../../structure`, which already re-exports the same item-row function.
- `plan-resolution/index.ts`: the kept-condition reader and its types now re-export through `./extraction`, which already re-exports the same conditions owner. Removed the obsolete two-line comment claiming that barrel still creates a cycle.

The actual owner barrels and final source import lines were inspected. Function bodies, exports' names/types, fixtures, assertions, failure/provenance/receipt/retry/permission guards and baselines are unchanged. No neutral seam or behavior change was needed from the inspected traces. A successful final graph audit is not claimed; lead will repeat its narrow audit, then types/tests after the paired D2 SDK rebuild.

Outcome: Done
Changed: the three approved source files above; this report.
Validation: not run — reserved to lead; actual audit-3 output and named owner barrels inspected.
Not verified: final audit, compilation, regression tests, paired D0/D2 integration or live/browser behavior.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-final-imports.md`
Notes: Source frozen. Import/export specifiers only plus obsolete comment removal. No baseline, fixture or git changes.
