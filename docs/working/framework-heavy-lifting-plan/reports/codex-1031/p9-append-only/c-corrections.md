# C structural correction

Source status: FROZEN after relocation; no checks, builds, audits, git or baseline edits run.

Moved the complete feature from `runtime/llm/node-tools/run-nodes/` to `runtime/llm/node-reruns/`, removing one directory level as requested. Paths are relative to `packages/fluxiq/src/programs/automation-studio/`.

The moved feature retains `types.ts`, `tool.ts`, `prior-call.ts`, `result.ts`, `identity.ts`, `execute.ts`, `index.ts`, and `tests/run-nodes.test.ts`. External relative imports were shortened by one level; local feature imports are unchanged.
`runtime/llm/node-tools/index.ts` now re-exports `../node-reruns/index.ts`, preserving the existing Core package public exports. No tool offering or loop/service integration changed.

Ports, results and behavior remain exactly as `c-implementation.md` specifies. Private actual-dispatch provenance after binding/retry/reacquisition remains mandatory; draft/ranWith/raw model JSON and eligibility flags still cannot establish authority. Ordinary wrapped/accounted reruns remain D's responsibility.

Final feature path for D: `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-reruns/`.
New exact owning selector: `src/programs/automation-studio/runtime/llm/node-reruns/tests/run-nodes.test.ts`.
Lead acceptance command: `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/node-reruns/tests/run-nodes.test.ts`.

The lead reported that pre-move C tests and package typecheck passed. This worker did not run or independently verify them; relocated source still needs the lead's owning tests/types/audit.
All old source files were removed by the move. Runtime tool policy rejected optional deletion of the old empty filesystem directories with the stated reason `blocked by policy`; the cleanup process did not start and no alternate deletion was attempted. Empty directories are untracked and do not retain a second source location.

Outcome: Done
Changed: C feature relocated to `runtime/llm/node-reruns/`, owning imports/tests, `node-tools/index.ts`, and this report
Validation: not run — correction brief reserves all checks/builds/audits to the lead
Not verified: relocated tests, typecheck, structure audit or D integration
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/c-corrections.md`
Notes: Source frozen; ports/behavior unchanged. New selector above supersedes the original report's path. Optional old empty-directory cleanup was blocked by runtime policy.
