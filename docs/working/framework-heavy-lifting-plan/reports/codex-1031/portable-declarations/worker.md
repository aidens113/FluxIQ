# Portable SDK declaration boundary worker

## Current status

Done within the bounded worker scope. Lead released source/tests after setup and approved the existing `scripts/tests/` harness. Explicit source return signatures, the owning declaration guard, tests and the authored package-boundary note are SOURCE/TEST FROZEN. Final script tests and affected runtime tests pass. No provider, browser, full-suite, secret, repository generated-output, or git mutation was performed.

## Diagnosis

- The four observed TS2307 errors are emitted in `batch-member.d.ts` (two imports) and `service/execution-authority/create.d.ts` (two imports). All reference the bare workspace path `packages/contracts/dist/core.js`.
- `batch-member.ts` annotates its local executor with the owned `AutomationStudioLlmEvidenceLoopInput["executeTool"]` contract, but leaves the returned object inferred. Declaration emit expands the executor's structure and must name its external `JsonObject` and `JsonValue` symbols.
- `execution-authority/create.ts` similarly leaves its returned object inferred. Declaration emit expands the existing `AutomationStudioLlmPriorNodesAuthority` contract inside `rerunAuthority.resolve` and must name `JsonObject` twice.
- The build config clears `paths` but inherits repository `baseUrl: "."`. The serializer selects an internal base-relative path for the expanded cross-package symbols. Both symbols genuinely exist at the public `@fluxiq/contracts/core` export, but replacing the generated path would treat the symptom and would be unsafe for arbitrary leaked symbols.
- The declaration postprocessor currently performs only a relative `.ts` to `.js` replacement. It does not validate that resulting declarations resolve outside the repository's aliases. The relevant package build commands already invoke and fingerprint this script.

## Implemented

1. Both returned objects now name existing owned contracts (`AutomationStudioLlmEvidenceLoopInput["executeTool"]`, `AutomationStudioLlmRerunOutcome`, and the permission/person-needed/runtime-authority return types). Runtime object/getter behavior and the same structural public API remain intact.
2. The guard stays in the existing declaration postprocessor, preserving build-cache input coverage. TypeScript AST traversal identifies actual imports, exports, import types, import-equals and external augmentations; relative `.ts` to `.js` rewriting is preserved. NodeNext resolution uses no workspace `baseUrl` or `paths`. Unresolved aliases, absolute/platform-specific paths, private export subpaths and relative output escapes fail before any declaration is written or the build is stamped. Built-ins, emitted ambient declarations, self exports and require-mode conditions are supported. Non-relative aliases are never rewritten.
3. Eight focused tests live in the existing `scripts/tests/` harness. Isolated emitted workspace inference reproduces `import("packages/contracts/dist/core.js")`; both the guard and a strict external consumer reject it. Existing owned return contracts then emit valid references; the guard and strict external consumer pass, and a deliberately invalid consumer assignment still fails with TS2322. Actual `@fluxiq/contracts/core` export metadata and JSON type declarations supply the fixture's public seam. Additional cases cover the four original imports, rewriting/idempotence, public/private/self exports, Node built-ins, ambient declarations/augmentation, require conditions, arbitrary aliases, absolute/platform paths, and relative escapes.
4. `docs/architecture/package-boundaries.md` documents alias-free declaration validation and explicit owning return contracts.

## Evidence and checks so far

- Read-only `Get-Content` of the main SDK's two emitted declaration files reproduced all four internal imports.
- `Select-String -LiteralPath 'C:\Users\osrs_\FluxStuff\!FluxIQWebExtension\test-runs\2026-10-31-t833-validation\claude-preflight.log' -Pattern 'TS2307' | Select-Object -Last 4 -ExpandProperty Line` showed exactly the four TS2307 errors at the briefed locations.
- Read-only source/config inspection confirmed existing owned contracts, `baseUrl` inheritance with build `paths: {}`, and real `@fluxiq/contracts/core` exports for `JsonObject`/`JsonValue`.
- During the initial HOLD no validation or source/test edits ran. Lead explicitly released implementation after setup.
- `node --test scripts/tests/rewrite-declaration-imports.test.mjs` -> PASS 8/8, 0 failed, 14.840s on the first implementation. After adding explicit module-augmentation mode coverage, the final same command -> PASS 8/8, 0 failed, 15.610s.
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/prior-nodes/tests/failure-boundaries.test.ts src/programs/automation-studio/runtime/llm/prior-nodes/tests/service-wiring.test.ts src/programs/automation-studio/runtime/llm/prior-nodes/tests/authority.test.ts --maxWorkers=2 --minWorkers=1` -> PASS 7/7 tests, 3/3 files, 74.26s. Failure boundaries (2), actual service candidate/project authority wiring (2), and actual registry authority (3) passed. These tests use isolated data and a mock provider; no live calls were made.

## Remaining

Lead retains version/git/shared documents, SDK build, package types/audit, and the actual downstream consumer build. Strict isolated regression acceptance does not claim the actual downstream build has passed. Guard validates module-path resolution, not every referenced symbol's semantic typing; the strict regression additionally verifies the genuine JSON export types and preserves negative type checking.

## Return contract

Outcome: Done
Changed: `scripts/rewrite-declaration-imports.mjs`; `scripts/tests/rewrite-declaration-imports.test.mjs`; `packages/fluxiq/src/programs/automation-studio/runtime/llm/prior-nodes/batch-member.ts`; `packages/fluxiq/src/programs/automation-studio/runtime/service/execution-authority/create.ts`; `docs/architecture/package-boundaries.md`; this report.
Validation: `node --test scripts/tests/rewrite-declaration-imports.test.mjs` -> 8/8 pass,15.610s; named three-file `pnpm.cmd --filter fluxiq exec vitest run ... --maxWorkers=2 --minWorkers=1` above -> 7/7 pass,74.26s.
Not verified: Final SDK rebuild, package types, structure audit, actual downstream test-runner consumer build (lead-owned); no provider/browser/full sweeps run.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/portable-declarations/worker.md`
Notes: Explicit existing contracts preserve runtime/public structural types. No alias-to-public-symbol rewrite. Source/tests frozen for lead acceptance.
