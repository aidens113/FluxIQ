# Core explicit control guidance implementation

Outcome: Done (source and owning tests); root owns paired acceptance, SDK and git.

Implemented optional explicit `act.controlOperations` admission, copy/freeze and
fixed-position rendering. Core A0/A1/A5/A6/A7 retain their literal values and
order. No three web operation paragraphs remain as a Core fallback. Missing or
empty slots add nothing; empty paragraphs and embedded LF retain exact bytes.
Examples remain an independent tail, and no metadata is inferred.

The actual candidate and subflow renderers receive the companion through both
binding Picks. The completion factory preserves existing argument positions and
accepts guidance third; its format-only description is unchanged. The outer
public barrel exposes only the guidance type and assertion, not the act renderer.

Checked bindings reject inherited/accessor metadata, validate independently of
examples/system instructions and install immutable copies even when originally
absent. Host callback receivers remain preserved; new and existing tests cover
private state and WeakMap-backed callbacks. Validation rejects unknown keys,
symbols, sparse/decorated/accessor/subclass arrays, malformed revisions, nonstring
paragraphs and non-LF controls; bounds remain independent 64KiB UTF8/4096 entries.

Root explicitly expanded this brief to correct the same final-line-separator
revision defect in all three authored metadata validators. One internal
runtime/authored-metadata revision pattern now enforces exact ASCII end matching.
Existing valid revisions, paragraph/text content and all bounds are retained.
Each owning validator tests LF, CRLF, U+2028, U+2029 and overlength revisions.
No public export or broader system-instruction property policy was introduced.

Changed paths (under packages/fluxiq/src/programs/automation-studio/runtime):
- authored-metadata/{revision-pattern,index}.ts (new internal owner).
- flow-bootstrap/script-guidance/{validate,render-act}.ts and tests/guidance.test.ts (new); index.ts extended.
- flow-bootstrap/plan/{flow-script-format,evidence-schema}.ts and tests/flow-script-format.test.ts.
- flow-bootstrap/script-examples/{validate,render-format}.ts and tests/examples.test.ts.
- flow-bootstrap/candidate/authoring-loop.ts and tests/authoring-loop.test.ts.
- flow-bootstrap/subflow-candidate/builder-loop.ts and tests/builder-loop.test.ts.
- flow-bootstrap/index.ts (public assertion export only; root supplied frozen type export).
- llm/harness-options/bootstrap-completion.ts.
- llm/domain-instructions/{validate,binding-check,binding-snapshot}.ts and tests/{validate,guidance-binding}.test.ts.
- Authored docs/architecture/automation-studio/client-script-guidance.md (new).

Root-owned contracts, binding field, package version and shared working documents
were not changed. No parser, executor, permission, provider or runtime policy edit.

Validation:
- `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/script-guidance/tests/guidance.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/guidance-binding.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/examples-binding.test.ts src/programs/automation-studio/runtime/flow-bootstrap/script-examples/tests/examples.test.ts src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/flow-script-format.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/authoring-loop.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts` -> first attempt did not launch because PowerShell blocked pnpm.ps1. Used pnpm.cmd thereafter.
- Initial seven-file run -> 117/118 passed; new fixture wrongly exceeded existing 4000-character system-instruction limit. Corrected fixture to 4000; new two-file guidance retry -> 12/12 passed in 68.00s.
- Initial `pnpm.cmd --filter fluxiq check` -> two errors only, from new transport fixtures explicitly supplying undefined optional properties. Corrected to omit absent properties.
- Initial `node scripts/structure-audit.mjs` -> one packed statement in new test (corrected), plus shared docs/working/README.md drift (root-owned).
- Final `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-bootstrap/script-guidance/tests/guidance.test.ts src/programs/automation-studio/runtime/flow-bootstrap/script-examples/tests/examples.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/validate.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/guidance-binding.test.ts src/programs/automation-studio/runtime/llm/domain-instructions/tests/examples-binding.test.ts src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/flow-script-format.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/authoring-loop.test.ts src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts` -> 152 tests / 8 files passed, 77.50s.
- Final `node scripts/structure-audit.mjs` -> one violation only: shared docs/working/README.md header-index drift. No code violations. Root notified; worker must not edit shared index.
- Final `pnpm.cmd --filter fluxiq check` -> pending at report creation; result appended below.

Not verified: public SDK build, exact Down byte pins/completion digest/saved-graph
proofs (root/Down acceptance), full suites, browser or provider behavior. No
builds, full suites, provider/browser runs, secrets, git or package edits occurred.
- Final type result: `pnpm.cmd --filter fluxiq check` -> PASS exit0, build-cache fluxiq:check stored successful check, 120547ms. No diagnostics.

Return contract:
Outcome: Done
Changed: Core explicit-guidance admission/rendering/consumer transport, owning tests, internal shared revision owner, authored client-script-guidance doc; paths listed above.
Validation: final owning Vitest command above ->152/8 passed77.50s; `pnpm.cmd --filter fluxiq check` ->PASS120547ms; standalone audit ->only root-owned README drift (root subsequently regenerated index and owns final audit).
Not verified: public SDK/Down byte pins/saved graphs, full suites, browser/provider.
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-control-guidance/core.md
Notes: Source frozen after narrow authorized same-policy revision correction. No git or shared-doc edits. Root owns final audit/paired acceptance.
