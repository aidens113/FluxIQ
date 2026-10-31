# Unit2 structure correction

Outcome: Done

Source frozen after the lead's explicit Down source release. Moved the complete exported web runtime contract and its two named request contracts out of `tools.ts` into cohesive `runtime-contract/{runtime,failure-evidence-request,state-digest-request,index}.ts`. Each leaf has one exported type; the directory barrel exports its contract surface.

`tools.ts` imports the runtime type through the owning contract barrel and preserves all three existing type exports, so the established llm-evidence public barrel and consumers remain compatible. Contract dependencies use type-only imports through their existing owning barrels. The contract's two internal request types use sibling leaves within the same contract directory; no cyclic runtime import or cross-directory leaf exception was needed.

The runtime interface, request fields and associated explanatory comments moved intact. `flowScriptExamples` remains required on the Down interface and remains supplied at actual runtime creation. No runtime logic, script examples, grammar, system instructions or guidance bytes changed. The original coordinator comments remain; this is a responsibility split rather than a line-limit formatting workaround.

Changed: Down `domain/src/runtime/llm-evidence/tools.ts`, `domain/src/runtime/llm-evidence/runtime-contract/{runtime,failure-evidence-request,state-digest-request,index}.ts`; this report.

Validation: not run; source-only brief prohibits tests/builds/audits. Source reads confirmed the moved definitions and preserved supplied companion. Lead-reported earlier 21 tests and typecheck success predate this split and are not claimed as validation of it.

Not verified: post-split package types, owning tests, structure audit. Root owns the independent stale working-document index correction.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit2-structure-correction.md`

Notes: No Core source, baseline, version, shared-document, git, build, browser or provider changes. Source frozen for lead acceptance.
