# Runtime Ownership And Web Boundary Refactor

Status: Active
Status detail: First capability extraction validated at package level; browser matcher integration under repair; remaining runtime and final reusable chat UI phases required.
Created: 2026-11-01
Last updated: 2026-11-02
Owner: Senior supervisor agent
Scope: Separate framework runtime from Automation Studio ownership and audit all downstream web boundaries.
Paired document: ../!FluxIQWebExtension/docs/working/runtime-ownership-refactor.md
Related: [architecture](../architecture/README.md)

## Current State

User authorized the complete Core/downstream ownership audit and refactor with Core workers, followed by the reusable chat widget package. Work is isolated on paired task/t842-runtime-boundary-refactor branches under C:/Users/osrs_/FluxStuff/fxwork/t842; these belong to the original repositories, not separate cloned histories. Original downstream changes are preserved.
Core owns neutral framework/runtime mechanisms; downstream owns active browser/DOM/selector/tab interpretation. Existing public entry points forward to canonical implementations for compatibility.
Implemented first capability group: neutral contracts, canonical automation nodes and engine/host support, provider/model and agent primitives, executable DSL/validation, and downstream calibrated web matcher with explicit domain registration.
Core package typecheck and library build pass. Selected Core run passed 2,350 tests and found eight failures; all five affected files subsequently passed their 22 tests after verified fixes. The preexisting cache test oracle was separately reproduced on original dev and corrected without production behavior changes.
Downstream: domain build/check and 55 host tests passed; the latest additional focused domain selection passed 80 tests. Test runner build/check and 32 persisted-run tests passed. Extension check passes from its valid build-cache stamp.
Exact matcher parity against original dev passed 582 comparisons; source-aliased identity/resolver checks passed 222 tests. These do not substitute for browser checks: the 34-case realistic-site Chromium identity selection currently reveals failures, assigned for investigation without weakening safety or assertions.
Structure audit: Core source has no new violations (working index needs regeneration); downstream requires a cohesive test-file split and index regeneration. Mirror check confirms 72 audit files match Core.
No paid runs, live providers, panel management or full daily sweeps started.
Next: repair browser integration, independently rerun affected checks and structure gates, commit/integrate/push this coherent first group to both real dev checkouts, then continue all residual ownership phases.
Remaining source work is explicitly required: SDK/native/adapter binding; environment/run control/resources; IO/graph options; compiled/composite execution; shared state/recording/gateway/normalization; router/gates/context; reusable authoring/repair/verification; remaining active browser semantics. Do not claim the audit/refactor complete at this checkpoint.
User requirement (2026-11-02): AFTER fully completing both repositories' audit/refactor, extract extension chat stream UI/component data to a separate reusable Core package (tentatively @fluxiq/ui-components), usable by any project/client. The extension consumes the standardized widget through downstream browser bindings. This is required continuation work.

## Phases

1. Inventory Core Automation Studio responsibilities, consumers and dependency cycles.
2. Inventory downstream ownership and web-specific code incorrectly retained by Core.
3. Refactor verified misplaced code into owning layers, preserve existing public exports and add mechanical boundaries.
4. Verify touched packages, focused regression tests and structure checks; document compatibility and integrate both repositories.

## Remaining Ownership Phases

These phases are required by the original refactor, not deferred recommendations.
The current cuts cover nodes, engine, host ports, provider/agent primitives, DSL and matching, with integration fixes in progress.

| Phase | Required capability/owner | Dependency |
| --- | --- | --- |
| R1 | Importer SDK and native binding -> components/automation/importer and runtime/native-execution | Current neutral nodes/matcher/host |
| R2 | Environment, run control, resource scheduling -> focused runtime owners | Current host ports |
| R3 | IO dispatch and graph option composition -> runtime/output-dispatch and execution adapters | R1/R2 |
| R4 | Compiled/composite execution + snapshot/composition contracts -> engine and flows | Current DSL accessor stable |
| R5 | Shared state/recording, normalizer and gateway recording ports -> state/recording owners | Shared wire types aligned |
| R6 | Router, permission/change/recovery gates and context packing -> engine/runtime capabilities | R5 and canonical model ports |
| R7 | Flow authoring/draft/coverage/trial/repair and verification -> focused runtime capabilities behind persistence ports | R1-R6; stable ArtifactSource/DraftStore/History/Evidence/ResultSink/Presentation/Model/HostSemantics ports |
| R8 | Remaining active browser target/location/wording interpretation -> domain adapters through trusted host ports | Cross-cutting; exact list in residual report |
| R9 | Focused integration/browser checks, authored docs, narrow merge gates and paired pushes; permitted full sweep for main | All code phases |
| R10 | Separate reusable Core chat-stream UI/component-data package, tentatively `@fluxiq/ui-components`; extension consumes it and any project/client can use the standardized widget | User requires this AFTER the full audit/refactor of both repositories |

See `runtime-ownership-refactor/reports/residual-runtime.md` for the complete remaining-area inventory and exact moves.

## Work Ledger

### 2026-11-02 ? Package integration and browser gate
- Agent: senior supervisor
- Changed: canonical capability integration, explicit capture result handling and domain matcher registration; focused test support split.
- Validation: Core `pnpm.cmd --filter fluxiq check` and `pnpm.cmd --filter fluxiq build` -> exit 0.
- Validation: Core selected regression runner -> 2,350 tests passed, eight failed; subsequent exact five affected-file rerun -> 22 passed, zero failed. Original dev reproduced stale cache oracle before correction.
- Validation: `pnpm.cmd --filter @fluxiq-web-extension/domain test element-fingerprint/tests output-nodes/tests/native-runtime output-nodes/tests/definitions actions/action-effect/tests runtime/tests/state-routing-run` -> 80 passed, zero failed.
- Validation: `node --test packages/test-runner/dist/flow-lane/tests/persisted-flow-run.test.js` -> 32 passed, zero failed (before cohesive support split).
- Validation: downstream test-runner and extension package checks -> exit 0, valid cache stamps reused.
- Validation: realistic-site Chromium identity-resolution/ambiguity/veto selection -> failures observed; investigation active, not accepted as passing.
- Outcome: Partial
- Follow-up: resolve browser failures, rerun split tests and structure gates; paired first-group integration, then all remaining phases including final shared UI package.


### 2026-11-02 — Required reusable chat UI package
- Agent: senior supervisor
- Changed: paired working documents; added explicit user-requested completion phase.
- Why: after the full audit/refactor of both repos, move the extension chat stream UI/component data into a separate reusable Core package, tentatively `@fluxiq/ui-components`, usable by any project/client; extension consumes it through browser-specific bindings.
- Validation: not validated; requirement recorded before implementation.
- Outcome: Partial
- Follow-up: execute only after the existing full audit/refactor phases, preserving stream behavior and keeping extension/browser APIs outside the shared package.

### 2026-11-01 — Begin t842
- Agent: senior supervisor
- Changed: paired plan and discovery briefs.
- Validation: not validated; initial dispatch only.
- Outcome: Partial

### 2026-11-01 — Verify neutral runtime contracts
- Agent: senior supervisor
- Changed: contracts runtime seam and generic runtime imports.
- Why: generic runtime must not depend on Studio result contracts.
- Validation: `pnpm.cmd --filter @fluxiq/contracts exec vitest run src/tests/runtime.test.ts src/failure/tests src/actionability/tests` -> 5 files passed, 50 tests passed.
- Outcome: Accepted
- Follow-up: integrate framework execution and web adapter moves.

### 2026-11-01 — Independent node/runtime/matcher verification
- Agent: senior supervisor
- Changed: canonical capabilities, contract seam and web adapter extraction.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/components/automation` -> 22 files, 184 tests passed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/tests src/runtime/result-control/tests` -> 5 files, 43 tests passed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/target-matching/tests/matcher.test.ts src/programs/automation-studio/fingerprinting/tests` -> 3 files, 9 tests passed.
- Validation: `pnpm.cmd --filter @fluxiq/contracts build` and `pnpm.cmd --filter @fluxiq/contracts check` -> exit 0.
- Outcome: Accepted
- Follow-up: global source-stable package and integration checks, residual extraction.


### 2026-11-02 — Combined integration checkpoint
- Agent: senior supervisor
- Changed: full capability migration tree at source-stable checkpoint.
- Validation: `pnpm.cmd --filter fluxiq check` -> failed: canonical/Studio graph envelope type mismatches, missing host DTO exports and readonly provider request diagnostics.
- Validation: `node scripts/structure-audit.mjs --json` -> 36 failures; dominant engine module SCC plus facade directory counts, prefix/depth placement, swallowed failures and stale index.
- Outcome: Partial
- Follow-up: engine-integration-fixes, studio-execution-adapters, model-integration-fixes dispatched; no full daily sweep used.

## Worker Briefs

Written briefs are under `runtime-ownership-refactor/briefs/`; each worker owns only its named report or source paths.
Core discovery: core-runtime and core-web. Downstream discovery: extension-boundaries.
Core implementation: runtime-contracts. Architecture review: execution-architecture.
Node implementation: node-ownership. Additional web audit: fingerprint-boundary.
Kernel implementation: execution-ownership. Web matcher implementation: web-matcher-ownership.
Provider/agent implementation: model-ownership. DSL implementation: dsl-ownership.
Read-only completion audit: residual-runtime.

## Decisions

- Existing Studio-prefixed names and persisted discriminator strings remain compatible.
- Framework execution consumers exist downstream; Studio naming does not establish program ownership.
- Executable graph types belong in flows/executable; neutral nodes in components/automation; executor in engine/automation.
- Studio retains editor/project APIs, persistence and product-specific authoring composition; shared execution support moves with its kernel.
- Framework owners must not import Studio, including type dependencies; the structure gate enforces the cut.
- Browser DOM producers and concrete web behavior remain downstream; generic web-panel rendering/HTTP transport are Core host concerns.

## Open Questions

No decisions requiring the user. Engine, provider/agent and web matcher ownership are implementation work.

None requiring user input.
