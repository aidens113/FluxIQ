# Web matcher ownership implementation

Outcome: Done (source complete; integration checks remain with lead)
Changed: See exact files below.
Validation: Neutral matcher tests 9/9; original-dev parity 582/582; source-aliased identity/resolver unit tests 222/222; isolated canonical/domain matcher type checks pass.
Not verified: Normal built-package downstream runners, whole touched-package type checks, post-migration runtime IO/native/recording suites, full structure gate, live browser behavior.
Report: docs/working/runtime-ownership-refactor/reports/web-matcher-ownership.md
Notes: No paid runs, browser launches, git mutations, package/config edits or baseline remaps.

## Ownership and behavior

- Core runtime/target-matching owns neutral identity contracts, structural state evidence, ranking and aggregate normalized score/confidence. Its declarations and comparisons contain no selector, XPath, HTML tag, URL, DOM class or attribute vocabulary. Opaque additional domain signals travel through a generic fingerprint/profile port.
- Domain element-fingerprint/matcher owns the complete calibrated browser comparisons and browser metadata projection. The extension uses this domain matcher; it retains stale-token filtering, drawing adaptation, corroboration, score floors and margins unchanged.
- Importer bundles explicitly register a matcher for manifest.domainId. Native implementations, target resolvers and recording mappers receive that domain's matcher. Unregistered scoring fails closed with a diagnostic error. Different domains cannot inherit each other's matchers, and conflicting matchers for one domain are refused before SDK registration.
- Policy dispatch accepts an explicit matcher. Runtime graph composition supplies the registered matcher for its bound domain. With candidates and no matcher, Core delegates to the output adapter and reports unresolved_no_matcher without a claimed confidence floor. With a matcher, existing confidence policy and refusal records remain in force.
- The deprecated native runtime elementMatcher property remains a neutral direct-use matcher for compatibility; it is never used as the context/domain fallback.
- The old Studio fingerprinting public seam retains names and complete browser-shaped DTO/weight declarations for source/wire compatibility. Its factory and free functions now perform neutral matching only; legacy browser weights are inert. Concrete web consumers must register/use the domain matcher. Saved target normalization and legacy fields remain intact.
- SDK logging DTO now imports/reexports the executor worker's canonical runtime/automation-host owner.

## Exact source and test files

Core:

- packages/fluxiq/src/runtime/target-matching/{index,contracts,state-evidence,aggregate,matcher}.ts
- packages/fluxiq/src/runtime/target-matching/tests/matcher.test.ts
- packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts
- packages/fluxiq/src/programs/automation-studio/fingerprinting/tests/{index,element-fingerprint}.test.ts
- packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts (ownership comment only)
- packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts
- packages/fluxiq/src/programs/automation-studio/runtime/{io-policy,native-node-runtime}.ts
- packages/fluxiq/src/programs/automation-studio/runtime/tests/{io-policy,native-node-runtime}.test.ts
- packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-session/graph-options.ts
- packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/proposal-generation.ts
- packages/fluxiq/src/programs/automation-studio/runtime/service.ts (recording mapper matcher argument only)
- packages/fluxiq/src/components/automation/contracts.ts (new delegated status; node worker released ownership)

Downstream:

- domain/src/element-fingerprint/{matcher,matcher-contracts,index}.ts
- domain/src/element-fingerprint/tests/matcher.test.ts
- domain/src/{index,client/index}.ts (browser-safe exports)
- domain/src/output-nodes/native-runtime.ts
- domain/src/output-nodes/tests/native-runtime.test.ts
- apps/extension/src/content/identity/score.ts
- apps/extension/src/content/identity/tests/score.test.ts (ownership comments only; assertions unchanged)

## Observed validation

Commands run from Core packages/fluxiq unless otherwise stated:

- `pnpm.cmd exec vitest run src/runtime/target-matching/tests/matcher.test.ts src/programs/automation-studio/fingerprinting/tests` -> 3 files, 9 tests passed (latest after final source edits).
- `pnpm.cmd exec tsc --noEmit --allowImportingTsExtensions --target ES2022 --module ESNext --moduleResolution Bundler --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck src/runtime/target-matching/index.ts` -> exit 0.
- Downstream domain `node node_modules/.cache/matcher-migration/parity.mjs` -> 582 exact full-object comparisons passed against original `git show dev:packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts`: 500 varied score pairs, 40 ranking pools, 40 best selections, 2 state projections. Default weights identical. Lead independently reran this.
- Downstream domain `node node_modules/.cache/matcher-migration/identity.mjs` -> 222 tests passed across 25 identity/resolve-target files using source aliases and the repository runner's shared-process before-hook pattern. No original assertions changed. Excludes created-node-identity integration, which reaches the full runtime and needs the normal package build.
- Downstream domain `pnpm.cmd exec tsc -p node_modules/.cache/matcher-migration/tsconfig.json` -> exit 0 for matcher/contracts/golden fixtures with canonical Core source aliases. This is an isolated check, not the package check.
- Runtime focused command naming io-policy.test.ts, native-node-runtime.test.ts and service-recordings/tests/proposals.test.ts reached 0 tests: executor worker was still creating runtime/activity/index.ts. No runtime assertion failure was observed. Lead must rerun after graph stabilizes.
- An accidental `node scripts/structure-audit.mjs --help` ran the audit because unknown flags are ignored. It reported 31 task-wide violations while other workers were still moving sources. Five new canonical matcher packed lines were fixed immediately; no baselines were altered. Scoped structure results follow when complete.
- Direct rule API calls via `node --input-type=module` for imports, exported-values, as-never, naming, directory-files, file-lines, statement-packing, import-cycles and test-placement -> 0 findings for canonical runtime/target-matching and 0 findings for new downstream matcher/contracts/golden test files.

## Lead integration checks

1. Rebuild Core library once the shared source graph is stable.
2. Run normal domain filtered runner for element-fingerprint/tests, output-nodes/tests/native-runtime and persistence/action-target tests; run extension filtered runner for content/identity/tests and content/action-runtime/tests/resolve-target (including created-node-identity).
3. Run focused Core IO/native/recording tests plus model/tests/action-element-target.test.ts. New tests cover explicit registration, missing adapters, per-domain isolation, conflict refusal and delegated diagnostics.
4. Run touched package type checks and full structure audit. No full suite or browser operation was started by this worker.
