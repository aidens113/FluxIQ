# Unit1 binding compatibility correction

Outcome: Done
Changed: runtime/llm/domain-instructions/{binding-check,binding-snapshot}.ts; owning tests/{examples-binding,validate}.test.ts; runtime/flow-bootstrap/index.ts.
Validation: not run — brief explicitly forbids checks/builds/audits; source reviewed only.
Not verified: test execution, typecheck, structure gates and public export compilation.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit1-compatibility.md
Notes: Source frozen. No service/shared runtime-public barrels changed.

The original spread changed own callback receivers and omitted prototype methods. No binding contract excludes class instances or receiver-dependent callbacks. A focused binding-snapshot helper now retains the host prototype and property descriptors, binds callable properties and accessor receivers to the original host, and installs independent read-only metadata slots. Prototype callbacks are materialized onto the snapshot using the original receiver, supporting private class fields. Metadata remains copied/frozen by its validators; originally absent metadata is an explicit undefined slot so later attachment on the host cannot bypass validation. Caller objects are not mutated.

Tests authored for own WeakMap(this)-backed callbacks and inherited private-field class callbacks, each with absent and present examples. They observe the helper and the actual service storage path (method bind for WeakMap, constructor bind for class), and test caller changes cannot change stored metadata. Tests have not been run.

The feature is exported from runtime/flow-bootstrap/index.ts. Root confirmed existing wildcard chains already forward to runtime/index.ts and public automation-studio/index.ts, so the previous report's request to edit those shared barrels is superseded. Contract/renderer names and signatures remain unchanged.
