Role: Heavy worker; gpt-6.1-sol; max.
Goal: Separate generic declarative Flow DSL/region compilation from Studio persistence stamping.
Owned old Core (packages/fluxiq/src): programs/automation-studio/dsl/**,
programs/automation-studio/runtime/region-compiler.ts + runtime/tests/region-compiler.test.ts if present.
Owned canonical: flows/executable/dsl/**, flows/executable/regions/compilation/** only.
Expansion: model/validation/flow.ts + tests/flow.test.ts; executable/validation generic flow/interface/value-type/index;
components/automation/control-flow/event-applies.ts + its barrel; engine lifecycle event-applies facade only.
Must not touch git/shared docs/root barrels/package/config, other model/runtime/nodes/engine files. No agents.
Read AGENTS/CODEX/code-structure, plan Current State and execution-architecture report DSL section.
First inspect and report exact closed cut + any required additional paths before implementation.
Canonical DSL owns declarations, pure source parsing/generation, dependency/registry checks and executable plan compilation.
Studio wrapper owns project/authoring timestamps/source/publication envelope and current persisted digest contract.
Preserve old defineFlow/compileFlowDefinition/parse/generator API and generated source compatibility;
new canonical generation may target fluxiq/flows/executable/dsl once lead exposes it.
Do not change digest/serialized contracts or allow arbitrary source execution.
Separate compileAutomationStudioRegions generic algorithm from Studio PolicyGraph adaptation.
Canonical source must never import Studio even type-only; use newly extracted executable contracts/node pack.
Do not duplicate validators/normalizers in two authorities; move generic parts or inject program-specific validation.
Coordinate new regions/compilation subdir with executor worker; other regions files remain theirs.
Move tests with subjects and add exact digest/output compatibility + closed source graph tests.
Fix structural violations at new paths rather than carry/increase baseline.
No paid runs/panel/browser/full suites. Only focused DSL/region tests once source stable.
Lead owns exported public subpath, root barrel, docs and external import migration.
Report docs/working/runtime-ownership-refactor/reports/dsl-ownership.md.
End Outcome/Changed/Validation/Not verified/Report/Notes contract.
