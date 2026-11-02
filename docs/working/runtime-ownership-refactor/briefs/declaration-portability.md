# Public declaration portability

Role: Standard worker, gpt-6.1-sol, medium effort.
Repo: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ; work only here.
Goal: Fix recurring TypeScript-inferred workspace alias imports in emitted declarations without weakening the portability gate or exposing private APIs.
Read: Current State of ../../runtime-ownership-refactor.md; scripts/rewrite-declaration-imports.mjs; scripts/tests/rewrite-declaration-imports.test.mjs; .fluxiq/foundations-build.log; relevant contracts package exports and emitted failing declarations.
Owned: scripts/rewrite-declaration-imports.mjs; new cohesive scripts/declarations/** helper/barrel/tests; existing rewrite-declaration-imports test file if needed. Own report only.
Must not touch: Core runtime/contract implementations, package exports/config, other workers' source/reports, shared docs/indexes, original/t844 repos. No git/spawn/providers/full suites.
Failure: new inferred declaration import types use packages/contracts/dist/state.js, state/contracts/*.js, recording/domain/contracts.js, core.js, etc. They are not portable. Explicit return annotations fixed one isolated earlier case; this recurrence needs a structural public-export solution.
Prefer rewriting ONLY proven workspace-inferred qualified import types through actual public package exports. Derive public entries from owning package.json exports; never blindly prefix-rewrite a private path or add wildcard private exports.
For internal leaf references, prove the requested exported symbol has the SAME declaration origin through a public barrel (TypeScript symbol/alias resolution), not merely the same name/type shape. Generic canonical ActionResult differs from legacy specialized alias; do not conflate them.
Prefer an exact public entry or smallest relevant public export surface. Preserve generic arguments/qualifiers and all existing rejection of unresolved, escaping, absolute/platform-specific and private imports. If proof is missing, continue failing explicitly.
Keep solution narrow: qualified import-type nodes suffice for observed failures; namespace/side-effect/ambiguous forms may remain rejected unless equivalence is proved. No source-definition guessing or broad suppressions.
Use ownership/feature/kind structure, one exported thing/file and feature barrels; no baseline exceptions/increases.
Acceptance: existing rewrite tests; meaningful added public-origin/generic-specialization/private-rejection tests in throwaway packages; run owning rewriter against current emitted packages/fluxiq/dist to confirm every current declaration resolves without workspace paths. Generated output is changed only through the owning script, never hand-edited.
Do not run package-wide build/check while root coordinates; report source freeze and exact commands/results so lead can rebuild all three libraries normally. Do not stamp runtime identity manually.
Report: docs/working/runtime-ownership-refactor/reports/declaration-portability.md.
Return: Outcome; Changed; Validation exact observed commands/results; Not verified; Report; Notes <=3 lines.
