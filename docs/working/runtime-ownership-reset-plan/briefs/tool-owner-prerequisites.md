# Complete evidence-tool and harness-binding prerequisites

- Role: heavy worker, gpt-6.1-sol, max effort, existing sql_foundation agent.
- Goal: close P2's full contract prerequisites, then return the exact dependency-complete tool move manifest for prompt dispatch.
- Read: parent Current State; reports/admission-owner-manifest.md P2 and prerequisite rows; llm/evidence-loop/{tool-execution,tool}.ts; llm/harness-options/registry.ts binding type; runtime/agents/tools and runtime/flow-authoring/draft barrels.
- Paths below are under packages/fluxiq/src. Owned: programs/automation-studio/runtime/llm/evidence-loop/tool-execution.ts; surgical binding type extraction/import+reexport in llm/harness-options/registry.ts; new runtime/agents/tools/execution-result.ts and harness-binding.ts (or cohesive child directory if structure requires), tools barrel; one legacy compatibility test and your report.
- Must not touch: model/flow-adaptation.ts, service.ts, router, engine, environment/observation helpers, shared docs, runtime/build-execution production files yet, or any existing worker paths.
- Full tool declaration already exists canonically in runtime/agents/tools/definition.ts. Four full draft Change/Condition/Replay/Toggle types already exist canonically in runtime/flow-authoring/draft. Reuse them, do not duplicate or reduce.
- Move complete original execution-result and binding declarations including every optional field/comment/literal, every executeTool input and exact rich union return. Keep full actual permission contract through canonical flows/executable/permissions, not Studio aliases.
- Old symbols actual reexports; no same-name alias declarations, renamed DTOs or lost optional fields. Other registry runtime statements and imports retained except strictly necessary canonical type imports.
- Canonical source/type closure excludes programs even erased imports. Inspect narrow canonical draft barrels for cycles; use existing public cohesive barrels, no broad actor imports or helper bypasses.
- Save original declarations first and prove AST/docs/literal/export parity. Scoped strict closure/structure and relevant existing owner tests only against stable closures. No package-wide readers/builds/provider/browser/git/agents.
- Then inspect ONLY P2 files named in admission-owner-manifest.md and prepare exact file-owned follow-on move brief, destination/export/import manifest and stable prerequisites. Report missing dependency precisely; do not move production tool actors without Root grant.
- Report: docs/working/runtime-ownership-reset-plan/reports/tool-owner-prerequisites.md. Record commands and held acceptance, source/test manifest.
- Return: Outcome, Changed, Validation, Not verified, Report, Notes (at most three lines).
