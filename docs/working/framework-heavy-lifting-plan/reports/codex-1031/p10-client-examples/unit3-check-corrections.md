# Unit3 acceptance corrections

Outcome: Done

Source frozen. No production changes, checks, builds, audits, git or provider calls.

The two partial metadata fixtures now supply the definitely-present two authored loop lines directly. No public type widening, assertion cast or suppression was introduced.

Consolidated candidate metadata cases into existing `candidate/tests/authoring-loop.test.ts`, subflow cases into existing `subflow-candidate/tests/builder-loop.test.ts`, and completion cases into existing `plan/tests/flow-script-format.test.ts`. Added required imports and scoped fixture setup inside the owning describe blocks to avoid name collisions. All six candidate cases, six subflow cases and three completion tests retain their existing assertions. Deleted the three superseded source paths through apply_patch; no deeper directory, packing, baseline changes or unrelated ownership.

Updated unit3-core-report.md to use these consolidated selectors and describe their current location.

Lead rerun selectors, after `pnpm --filter fluxiq exec vitest run`:

- `src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/authoring-loop.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts`
- `src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/flow-script-format.test.ts`

Then package types and structure audit as briefed. Earlier 137 passing tests and the two type/three count failures are lead-reported context, not worker validation.

Changed: the three existing owning test files, deletion of their three superseded new test files, unit3-core-report.md, this report.
Validation: not run; brief prohibits checks/builds/audits. Moved test source inspected.
Not verified: rerun test results, package types, directory/file budgets, SDK/downstream acceptance.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit3-check-corrections.md
Notes: Source refrozen. No production/Down/contract/version/baseline/shared-document changes.
