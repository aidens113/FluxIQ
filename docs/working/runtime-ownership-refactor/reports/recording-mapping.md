# Recording mapping, review and recipe extraction

Outcome: Done for the released R5 mapper/review/recipe unit. Owned source and tests are FROZEN. Final focused acceptance passed 17 files/119 tests; strict owned/consumer checking, source/erased closure, scoped structure/AST and whitespace/EOF checks passed. Stable SDK normalized candidate/evidence/binding/parameter-normalizer authorities are consumed unchanged. Parent/package exports remain lead-owned.

## Locked normalizer slice reported before implementation

Actual owner: `packages/fluxiq/src/runtime/native-execution/native-node-runtime.ts`. The old Studio native-runtime file is already a compatibility reexport and needs no change.

- Imports and private fields near current lines 7 and 26: consume the existing SDK binding/normalizer types; add one domain-scoped normalizer binding that retains the original function and original implementation-bundle receiver. Do not create another mapper or SDK registry.
- `register` near current lines 35–61: inspect only `bundle.recordingCandidateParameterNormalizer`, validate a present value is a function, capture it once, and reject a conflicting different function for that manifest domain before `this.sdk.register` or any matcher/node/mapper mutation. Manifest metadata never installs a function. Re-registering the same function retains the first original receiver rather than silently rebinding it.
- The registration commit area near current lines 62–73: retain the captured normalizer only after preflight succeeds. Store the original function/receiver plus one wrapper that calls the original function with the original bundle as `this`; later mutation of the bundle member cannot replace it.
- Mapper accessors near current lines 125–137: preserve raw `getRecordingMapper(domainId,id)` behavior. Add the narrow normalizer getter if needed, and type `listRecordingMappers` with the existing SDK binding authority, including `normalizeParameters` only when that registered domain actually has one. Missing stays absent; mapping shallow-copies parameters and never calls a browser fallback or infers domain from a target.
- Do not touch native execution, admission/provenance, grants, target refresh or output behavior. Add actual binder subjects for original receiver/function pinning, absent normalizer, conflicting-domain atomic rejection, and non-authoritative manifest metadata only after the lead releases this file.

The lead later released this exact slice after independently passing B's 22 files/195 cases. No native source dependency remains locked for this unit.

## Observed implementation progress

- The lead released the native file after independently passing B's 22 files/195 cases. Only the reported normalizer map/preflight/commit/get/list slice changed. Existing execute/admission/IO paths and the optional fifth observation argument remain untouched.
- `recording-mapping-binder-first.log`: the four new normalizer subjects plus the existing 16 native-runtime cases passed (2 files/20 tests, 3.72s). Absence keeps the original four binding fields and raw mapper identity; same-function registration pins the first receiver; a conflicting or non-function hook fails before registry/matcher mutation; manifest metadata never installs a function.
- Canonical `runtime/recording/mapping/**` now owns mapper calls/following references, validation, explicit expected-state outcomes, record-output/timeout handling, fallback, gap tracking, lookup ports, iteration/stats/issues, timeline filtering and review content. `flows/executable/recording/**` owns execution parameter/node/edge recipes and state/gap metadata. `components/automation/recording/**` owns definition IDs, definition/parameter projection and materialization.
- Studio retains proposal/review persistence envelopes, project identity, clocks, UUID allocation, layout/collision IDs and its separate two-name client transport policy. Review receives the result of that exact canonical filter, so it shares the same policy binding without duplicating or importing the normalizer's broader state heuristic.
- `recording-mapping-legacy.log`: all five retained integration subjects passed (49 tests, 66.60s). The required real-SQL `service/recordings/tests/proposal-candidates.test.ts` is unchanged. The old browser-target fixture in `runtime/tests/service-recordings/tests/proposals.test.ts` registers the trusted normalizer explicitly; every existing assertion remains intact, as approved by the lead.
- `recording-mapping-canonical-first.log`: 8 files/47 independent canonical and narrow Studio-adapter tests passed (3.10s). Initial strict checking found only a lost generic timeline subtype plus incomplete new fixture fields; those were corrected. Current strict scoped checking reports 65 files/0 errors, and source/erased import closure reports 743 modules/0 Studio or unresolved edges.

## Final ownership and behavior

- New feature roots contain 40 production modules, six canonical subject files and one test fixture. Every production leaf has one exported authority and every source directory has its feature barrel. Existing SDK candidate/evidence/binding/normalizer DTOs remain the single rich authorities.
- State-link/gap metadata lives beside the executable recipe in `flows/executable/recording/metadata/`: both the recipe and reusable component definitions consume that owner, without making component projection depend on runtime mapper orchestration. The old metadata functions reexport these exact callables.
- Canonical mapping owns registered/declared output checks, action-only source/confirmation checks, source/evidence ordering, confidence/default handling, record-output parsing/path defaults/encryption refusal, positive safe-integer timeout checks and candidate identity allocation at the original validated point. Missing normalization shallow-copies parameters and never infers browser targets. The real mapper and normalizer run with their original binding receiver; normalizer binding additionally pins the first original bundle receiver/function.
- Mapper exceptions become the fixed public `Unknown mapper error.`; original canonical validation errors retain their known messages/codes with bounded identifiers. Prototype/error-message copies and throwing message getters cannot supply public cause text. Candidate rejection still stops only that entry and the gap clock advances before validation, including rejected candidates.
- Canonical expected-state cloning returns `absent`, `not_plain`, `uncloneable`, `empty` or `state`; no caught clone becomes an ambiguous absent return. Plain conditions are cloned without interpreting them.
- Studio keeps proposal/review identity, project scope, persistence, two distinct review clock calls, status/notice fields, UUIDs, collision suffixes, editor positions and artifact metadata. Definition IDs preserve their historical escaping/fallback independently of Studio safe segments. Materialization preserves authored record-output/timeout edits, including explicit null, and exact original function identities forward from legacy definition helpers.
- Review content preserves raw/normalized associations, preserved/derived/dropped semantics, the compacted synthetic row, sorted-copy waits at the 250-ms threshold and the original issues array. The requested recording ID remains authoritative even when an overridden facade returns another recording ID. Original facade/writer receivers remain unchanged.

Changed legacy owners: `runtime/recording-flow-proposal.ts`; `runtime/service/recordings/{proposal-generation,proposal-candidates,timeline,normalization-review,candidate-definitions,types}.ts`; `runtime/service/recording-projections/mapper-candidate.ts`; the released native normalizer slice; adjacent new binder/review/timeline/recipe tests and definition identity coverage. Only the explicit-hook fixture and three existing packed callback lines changed in `runtime/tests/service-recordings/tests/proposals.test.ts`; all existing assertions remain. The required real-SQL `service/recordings/tests/proposal-candidates.test.ts` remains byte-for-byte unchanged (SHA-256 checked before/after).

## Final exact acceptance

Run from `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ`:

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/recording/mapping src/flows/executable/recording src/components/automation/recording src/runtime/native-execution/tests/recording-normalizer.test.ts src/runtime/native-execution/tests/native-node-runtime.test.ts src/programs/automation-studio/runtime/service/recordings/tests/proposal-candidates.test.ts src/programs/automation-studio/runtime/service/recordings/tests/candidate-definitions.test.ts src/programs/automation-studio/runtime/service/recordings/tests/timeline.test.ts src/programs/automation-studio/runtime/service/recordings/tests/normalization-review.test.ts src/programs/automation-studio/runtime/service/recordings/tests/review-request-identity.test.ts src/programs/automation-studio/runtime/service/recordings/tests/proposal-recipe.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/recorded-gap.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/proposals.test.ts src/programs/automation-studio/runtime/tests/service-recordings/tests/proposal-approval.test.ts --maxWorkers 2 --minWorkers 1
```

Observed exit 0: **17/17 files, 119/119 tests, 67.82s**. Log: `.fluxiq/refactor/recording-mapping-final.log`. The retained SQL candidate subject contributes its original 25 cases. The selection also proves the original 16 native runtime cases, four new binder cases, all retained proposal/approval/gap/definition oracles, six canonical subjects and four narrow adapter subjects. SQL services use their existing isolated temporary directories, never user data.

```text
node --max-old-space-size=4096 .fluxiq/refactor/recording-mapping-types.cjs
node .fluxiq/refactor/recording-mapping-closure.cjs
node .fluxiq/refactor/recording-mapping-structure.mjs
node .fluxiq/refactor/recording-mapping-whitespace.cjs
```

All exited 0 on final bytes. Respectively: strict isolated NodeNext **68 scoped owned/consumer files, 0 errors**, including the actual Studio service consumer; canonical value/type import/export closure **752 local modules, 0 Studio or unresolved edges**; **63 owned files, 15 official rule passes plus authority/barrel review, 0 failures/warnings**; **63 owned files, 0 whitespace/EOF failures, required SQL fixture hash unchanged**. Logs use the matching `.fluxiq/refactor/recording-mapping-{types,closure,structure,whitespace}.log` paths. No baseline/config writes occurred; unrelated in-flight findings were excluded.

Initial strict checking found a generic filter return that erased the caller's target subtype plus four incomplete new fixture fields. The filter now preserves the actual entry subtype and fixtures use complete existing contracts. Initial structure checking found two direct policy-leaf imports and packed test callback statements; imports now use the owning barrel and the statements were expanded without changing assertions. No acceptance oracle was weakened.

## Export and freeze handoff

Ready canonical feature barrels: `packages/fluxiq/src/runtime/recording/mapping/index.ts`, `packages/fluxiq/src/flows/executable/recording/index.ts`, `packages/fluxiq/src/components/automation/recording/index.ts`. The mapper runner accepts the actual SDK binding, narrow IO facts, actual matcher, generic timeline, canonical lookup ports, candidate-ID allocator and token formatter; it returns candidates/issues/stats. Review content and executable/component projections require no Studio DTO or service.

Lead retains parent/package export integration, authored architecture/shared working documents, broader coordinated build/downstream acceptance and git. No Core dist was rebuilt. No package check/full suite/provider/browser/panel/downstream/git operation ran in this unit. Downstream browser normalization binding is a separate lead-owned implementation and was not verified here. No other source/test edits or checks are planned; all owned validation processes ended before this report-only handoff.
