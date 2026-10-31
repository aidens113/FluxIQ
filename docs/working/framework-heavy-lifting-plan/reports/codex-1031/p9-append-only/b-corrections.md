# B acceptance corrections — source frozen

- `screen-situation.ts` now imports the existing owning
  `llm/harness/evidence-screen.ts` leaf, avoiding the harness barrel's path
  through flow-bootstrap back to route-state. This uses the documented import
  cycle exception; privacy logic and behavior are unchanged.
- Removed delta/screen helper exports from the public route-state barrel:
  production consumers are internal direct imports, and owning tests use the
  helper modules directly. The existing route-state barrel remains intact.
- No other source or behavior changes. Source frozen after these corrections.

Outcome: Done
Changed: route-state/screen-situation.ts; route-state/index.ts; route-state/tests/shown-window.test.ts; this report.
Validation: not run — corrections brief reserves acceptance for lead.
Not verified: corrected import graph audit, package types, owning tests.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/b-corrections.md
Notes: No copied/moved privacy policy, checks/builds, git or shared-state edits.
