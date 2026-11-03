Role: Discovery worker; model gpt-6-luna; effort high.
Goal: Audit ALL code in packages/fluxiq/src/programs/automation-studio for wrong framework ownership.
Owned: docs/working/runtime-ownership-refactor/reports/core-runtime.md only.
Must not touch: source, shared working docs, git state, downstream checkout; do not spawn.
Read: AGENTS.md Repository Boundary/Code Structure/Validation, CODEX.md,
docs/architecture/code-structure.md, docs/architecture/README.md,
docs/working/runtime-ownership-refactor.md Current State.
Inspect directory sizes and imports/consumers across Core; prioritize runtime, model, DSL, storage, nodes.
Distinguish Studio-specific orchestration from reusable runtime/engine/flows/core mechanics.
Return concrete move groups with old/new paths, consumers, cycles, public export compatibility,
and exact focused tests/checks. Identify largest safe coherent first implementation and remaining groups.
Read source as needed; do not accept folder names as proof. No broad suites or paid/browser work.
Report concise evidence, not file dumps. Include inventory counts and demonstrably justified ownership.
End with Outcome/Changed/Validation/Not verified/Report/Notes return contract.
