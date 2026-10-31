# Host observer structure corrections

Source frozen. Read the lead's downstream phase2 audit log and corrected the
six reported direct sibling-file imports in the host observer helpers through
their owning barrels. The existing `target-reacquire` barrel already exports
the matcher. The `llm-evidence` barrel now exports its existing defensive object
reader and withheld-text readers; no helper implementations were duplicated.

Unpacked the host repeat test's mutation-loop body and AbortController setup so
each statement occupies its own line. No test behavior, coverage gate, tokens,
capture commands or public contracts changed.

Source-only cycle review: the observer previously already consumed the evidence
barrel, and the target-reacquire host-runtime dependency is type-only. The new
barrel reader exports import no host/runtime-repeat values. No checks were run.

Outcome: Done
Changed: domain/src/runtime/llm-evidence/index.ts; domain/src/runtime/runtime-repeat/{capture,element-known,target}.ts; domain/src/runtime/tests/host-runtime-repeat.test.ts; this report
Validation: not run (lead prohibited checks/builds pending Core SDK freeze)
Not verified: Downstream typecheck, actual host tests, structure re-audit, browser behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/host-structure-corrections.md
Notes: Host-only source frozen. No producer/Core/baseline/generated/git changes.
