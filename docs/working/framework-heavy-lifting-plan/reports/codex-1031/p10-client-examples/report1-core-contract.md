# P10 unit1 Core contract

Outcome: Done
Changed: runtime/flow-bootstrap/script-examples/{contracts,validate,render,index}.ts and tests/examples.test.ts; runtime/llm/harness-options/binding.ts; runtime/llm/domain-instructions/binding-check.ts and tests/{validate,examples-binding}.test.ts (all under packages/fluxiq/src/programs/automation-studio).
Validation: not run — brief forbids all tests, typechecks, builds and audits; source review only.
Not verified: compilation, runtime test results, structure gates, public export integration, browser/provider behavior.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/report1-core-contract.md
Notes: Source frozen; no service/public barrel/prompt changes. Lead acceptance required.

## Actual store ownership

runtime/service.ts constructor line425 and bindLlmEvidenceRuntime line487 both assign automationStudioLlmEvidenceRuntimeBindingChecked into private llmEvidenceRuntime. The existing checker therefore owns the needed copy/validation seam; no service.ts lease or edit was required.

Checker now shallow-copies even bindings without instructions/examples so later caller additions cannot bypass the bind boundary. Supplied examples are validated into a fresh frozen object and frozen arrays each time. Caller-owned objects remain mutable. Existing instruction validation still applies independently.

## Frozen interface

- AutomationStudioFlowScriptExamples: readonly version:string; optional readonly format/act/loop/state string arrays.
- AutomationStudioLlmEvidenceRuntimeBinding.flowScriptExamples?: AutomationStudioFlowScriptExamples.
- assertAutomationStudioFlowScriptExamples(value:unknown, domainId:string): AutomationStudioFlowScriptExamples.
- renderAutomationStudioFlowScriptExamples(grammar:Readonly<Record<"format"|"act"|"loop"|"state",string>>, examples?:AutomationStudioFlowScriptExamples): Record<"format"|"act"|"loop"|"state",string>.
- Renderer appends one newline plus exact joined tail when the array has entries; omitted/empty arrays preserve the prefix. An authored single empty string appends a newline. No fallback, source parsing or prompt consumer changes.

Validation rejects unknown fields/symbols, nonplain objects/arrays, sparse/extra array entries, getters/setters, malformed versions, nonstrings, controls except LF, >4096 lines per section, and >65536 total UTF-8 authored bytes (version and joined line text). No truncation. This metadata bound is independent of model evidence/output limits.

## Required lead serial integration

The new feature index.ts already exports the type, assertion and renderer above. Add its owning export to runtime/flow-bootstrap/index.ts. Forward AutomationStudioFlowScriptExamples, assertAutomationStudioFlowScriptExamples and renderAutomationStudioFlowScriptExamples through runtime/index.ts and public automation-studio/index.ts in the existing explicit-export style after t830 release. None of those three barrels was edited here.

Run focused selectors for flow-bootstrap/script-examples/tests and llm/domain-instructions/tests (new examples-binding tests import actual service and inspect its stored companion). Then run package types/structure gates. Unit2 may consume the frozen type/renderer contract; unit3 consumer extraction is separate and not performed here.

Tests authored cover absent/partial/empty sections; generic document/archive examples; exact indentation, embedded LF and empty lines; caller mutation and independent bindings; invalid metadata with/without instructions; UTF-8 cumulative bound; getter rejection; and actual constructor/method storage paths. They have not been executed.
