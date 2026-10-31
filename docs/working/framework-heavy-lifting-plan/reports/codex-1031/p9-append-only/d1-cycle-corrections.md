# D1 residual module-cycle correction

Source status: **FROZEN** before this report. Source-only changes; no tests/type checks/builds/audits/browser/provider/panel/git operations run.
Inspected the actual six `import-cycles` failure traces in `test-runs/t830-d1-audit-2.log`; all prior error categories were resolved in that lead run.

## Actual cycle and removed edges

The reported 35-module cycle had this common runtime return path:
`frozen-execution/index -> page/index -> page/readable -> llm-evidence/capture -> state-digest/index -> snapshot-states -> route-state/index -> route-state/project -> llm-evidence/index -> tools -> frozen-execution/index`.
The current-page and run/tools traces reached the same return path; run/tools each exceeded their existing import-cycle baseline by one.

1. Removed the runtime `frozen-execution/index -> page/index` export edge. Pure capture/dispatch/binding consumers no longer obtain page orchestration through their root barrel. `run.ts`, its actual value consumer, imports `./frozen-execution/page` directly as the page-owning directory. No page helper body or call changed.
2. With explicit lead approval, removed the runtime `route-state/project -> llm-evidence/index` value edge. `actionableEvidenceElement` comes from its existing `llm-evidence/elements` owner; `webLlmReadableWords` comes from its existing acyclic `page-view/element` owner barrel. `WebLlmPageEvidence` remains from the public barrel through a separate explicit `import type`, so it is erased and cannot restore the runtime loop. The route projection body is unchanged.

The existing import rule was inspected, not executed: its direct-owner exception applies when the immediate directory barrel reaches back to the importer; type-only imports still go through barrels. The direct elements import meets that runtime-cycle exception. Readable words uses its acyclic owner barrel rather than a deeper file, and the page evidence type uses the public barrel.

The remaining page/current -> page/readable and page/readable -> capture edges are required owning dependencies, not suppressed. Their shared return into the runtime root is removed at route-state/project. Likewise capture still obtains both digest and route state through webLlmSnapshotStates: substituting only a digest would change behavior, while directly importing snapshot-states would not have removed the reported return edge. No digest/projection implementation was duplicated or weakened.

## Scope and limitations

Exactly three source files changed in this round: `domain/src/runtime/route-state/project.ts`, `domain/src/runtime/llm-evidence/node-run/frozen-execution/index.ts`, and `domain/src/runtime/llm-evidence/node-run/run.ts`.
All changes are import/export ownership; no function body, test fixture, acceptance oracle, Core source, public/wire contract, failure parser, retry/permission/effect/receipt guard, capsule data, reset/draft/replay-prefix behavior or baseline changed.
Source inspection counts run.ts at 797 lines; no packing or prose deletion.
The source import paths and actual traces were inspected manually. No successful audit, compile, test or live result is claimed. Lead must rerun its narrow audit, then final owning types/tests after paired Core freeze/rebuild; existing route-state projection tests are also relevant to the approved import-only file.

Outcome: Done
Changed: three import/export source files listed above; this report.
Validation: not run — the brief reserves checks/builds/audits to lead after source freeze. Actual audit traces and final import owners inspected.
Not verified: corrected import graph by audit, compilation, regression tests, paired D0/D2 integration, browser/live behavior.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d1-cycle-corrections.md`
Notes: Source frozen. No baseline growth or oracle changes. No git operations.
