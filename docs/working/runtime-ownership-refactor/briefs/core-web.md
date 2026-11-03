Role: Discovery worker; model gpt-6-luna; effort high.
Goal: Audit all Core source for domain-specific WEB leakage and internal layering problems outside Studio.
Owned: docs/working/runtime-ownership-refactor/reports/core-web.md only.
Must not touch: source, shared working docs, git, downstream; do not spawn.
Read: AGENTS.md Repository Boundary/Code Structure/Validation, CODEX.md,
docs/architecture/code-structure.md, docs/architecture/package-boundaries.md,
docs/working/runtime-ownership-refactor.md Current State.
Inspect packages, apps/web and runtime framework APIs; classify generic web panel/HTTP transport correctly.
Browser, DOM, selectors, tab-specific matching or adapters belong downstream;
generic contracts need evidence-based assessment, not naming alone.
Identify wrong dependencies into Studio from framework areas, actual second consumers, possible cycles.
Return exact paths, behavior, suitable owning area/downstream path, compatibility and focused checks.
Read-only commands only; no full suites, paid runs or panel start.
End with Outcome/Changed/Validation/Not verified/Report/Notes return contract.
