Role: Heavy architecture worker; gpt-6.1-sol; max.
Goal: Design executable ownership refactor demanded by user: runtime/framework code out of programs/automation-studio.
Owned: docs/working/runtime-ownership-refactor/reports/execution-architecture.md only.
Must not touch: source, shared docs, git, downstream. No agents.
Read Core AGENTS.md boundary/structure/validation, CODEX.md, code-structure.md,
architecture/README.md, paired plan Current State; read core-runtime report when present.
Inspect Studio runtime/model/nodes/dsl and existing runtime/engine/flows/components.
Downstream consumes Studio APIs as framework seams; don't infer program ownership merely from Studio names.
Need concrete complete migration map: generic executable flow contract+engine+nodes+DSL vs Studio editor/project/persistence,
small cohesive area destinations, stable compatibility exports, dependency inversion and public API evolution.
Analyze import dependency closure with actual paths; detect cycles and avoid moving whole Studio into a renamed catch-all.
Distinguish true Studio services from engine/model support, generic LLM/agent/provider orchestration and browser-specific behavior.
Recommend first LARGE coherent implementation doable now and follow-on parallel briefs by disjoint files.
User authorized refactor; don't stop at audit or trivial aliases. Keep persisted formats unchanged.
Need early recommendation soon, then precise file groups, old/new imports, contract-test relocation and narrow checks.
No full suites, paid runs or panel.
Return contract Outcome/Changed/Validation/Not verified/Report/Notes.
