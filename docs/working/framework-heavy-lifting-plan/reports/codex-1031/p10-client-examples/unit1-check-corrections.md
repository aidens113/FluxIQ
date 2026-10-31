# Unit1 owning-check fixture corrections

Outcome: Done
Changed: runtime/llm/domain-instructions/tests/examples-binding.test.ts.
Validation: not run — brief forbids checks; root previously observed 58 tests across 4 files pass.
Not verified: rerun tests, TypeScript and structure audit after this fixture correction.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit1-check-corrections.md
Notes: Source frozen. Production contract and implementation unchanged.

Valid fixture creation now accepts AutomationStudioFlowScriptExamples and omits the optional field when absent. Malformed metadata enters through an explicit unknown-valued Object.defineProperty helper on a fully typed base binding, replacing the banned as-never cast. HostBinding declares its optional member without emitting an undefined property and conditionally initializes examples in its constructor. WeakMap/private-class receiver and actual constructor/method storage assertions remain intact.
