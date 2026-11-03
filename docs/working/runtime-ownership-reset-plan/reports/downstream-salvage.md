# Downstream salvage audit

Read-only audit of the paired t843 downstream checkout on 2026-11-02. No source, git state, tests, builds, providers or browser sessions changed. This report is evidence for a reset decision, not runtime acceptance.

## Finding

Preserve the web behavior and its regression cases. Review and rework the paired registration/public API contracts as a coherent unit before integration. The downstream evidence does **not** support claiming that a full reset is cheaper: the new production code is small, concentrated, and substantially extracted existing behavior. A full reset would also require recovering the useful t842 boundary work already on `dev`.

Confidence: high on history, changed-path classification and preserved normalization bodies; medium on the contract recommendation; no estimate of full Core migration cost or runtime correctness is established here.

## Actual baseline and scope

- Downstream HEAD: `6e0e947a` (`task/t843-runtime-foundations`), a documentation checkpoint after pushed `460a5af6`.
- Downstream `dev` / `origin/dev`: `d6e5448c`, merge of t842. `git merge-base dev HEAD` returned `d6e5448c91d2fff131e891a0a41f084bcea930e8`; seven commits are ahead of it.
- The **pre-t842 downstream baseline** is the merge's first parent, `c9056f1a88fb552b25011f753e74599ba0b80c95`. Resetting t843 to present `dev` would retain t842's refactor.
- t842's merged delta against that parent is 112 files, +1066/-359. Its principal implementation commit is `a460ef90`; `a04bcf56` grouped persisted-run test support.
- t843 against present `dev` is 105 files, +2845/-174. Classification by path: documentation 10 files +749/-19; tests/support 61 files +1488/-130; audit/tooling 3 files +217/-3; production source 31 files +391/-22. The script test for the new audit rule is counted as tests/support. Many production-file changes are comments or imports.
- `git status --short` in the downstream checkout was empty both at initial inspection and after the audit reads. No downstream uncommitted source delta was observed. This makes no statement about newer uncommitted Core work.
- The paired pre-t842 Core baseline is `16b5043c5b986cb5a31b71bbabf4d4c11c289819`, the first parent of Core `dev` merge `ff8eb0be8`. The two baselines are repository-specific commits, not interchangeable task-branch tips.

## Path groups and recommendation

| Group | Actual behavior inspected | Recommendation / confidence |
| --- | --- | --- |
| t842 `domain/src/element-fingerprint/{matcher,matcher-contracts}.ts`, barrels, `apps/extension/src/content/identity/score.ts` | The domain now owns calibrated web weights, signal comparisons, snapshot metadata projection and ordering. The browser scorer calls `createWebElementMatcher` through the browser-safe domain client entry. Generic aggregation remains Core-owned through `fluxiq/runtime/target-matching`. | Retain the ownership split and original score fixtures. High confidence in useful ownership; no fresh execution proof. |
| t842 `domain/src/runtime/host-runtime.ts`, nearby tests | Consumes the public `fluxiq/runtime/automation-host` boundary instead of inferring a type from Studio. Unsupported nodes return `{ kind: "unavailable", reason: "unsupported_node" }`; actual gateway/malformed capture failures still throw. | Retain as an explicit protocol change, paired with the matching Core port. High confidence that restoring exception-as-decline would lose a useful distinction. |
| t842 action/extraction/output consumers and `scripts/structure-audit/config.mjs` | Public `fluxiq/components/automation` and action-effect imports replace program-owned node imports. New structural forbidden-import rules reject old node/action-effect paths and private Core source/build imports. | Retain the dependency direction and fail-build policy; adapt the exact public paths to the settled Core API. High. |
| t842 `packages/test-runner/src/flow-lane/persisted-flow-run.ts`, tests/support | Records `unresolved_no_matcher` without inventing score/confidence data; splits support into the owning tests directory. | Retain observable semantics and test coverage. High. |
| t843 `domain/src/target-normalization/**` and root barrel | Legacy flat/element/canonical shapes, safe metadata, drawing digest, typed-text exclusion, bounds, candidate selection and validation move downstream. All 25 top-level function bodies in the five behavior files match Core `dev`'s `programs/automation-studio/model/action-element-target.ts` after whitespace, public name and export normalization. Recording projection/normalizer additionally preserve the old precedence and fields from Core service helpers. | Retain behavior and original regression cases. High. These are moved domain semantics, not evidence for rebuilding the algorithm. Review malformed-input hardening separately: the weak canonical guard and assumptions about nested candidate/selection fields are inherited, not proven safe by extraction. |
| t843 `domain/src/output-nodes/target-preparation/**` | Thirty-line preparer normalizes only web targets, rejects required missing fingerprints, calls generic matching/confidence helpers, and returns prepared parameters/diagnostics/resolution. `default-matcher.ts` pins the original default method and receiver. | Retain as the web adapter candidate, with its no-candidates/no-matcher, custom receiver/arity, thrown-error and calibrated matching tests. Medium-high; its transport/admission contract must be accepted with Core. |
| t843 `domain/src/output-nodes/native-runtime.ts`, `io/manifest-definitions.ts`, manifest tests | Bundle supplies output preparation, recording projection, target policy and mapper normalization; manifest adds `recordingTargetPolicyRequired: true`, element outputs add `outputTargetPreparationRequired: true`. Defaults are deliberately overrideable; the factory marks only selected original callbacks pure through `ExecutionCallbackPolicies`. | Review together with Core importer registration, output admission and execution observation. Medium. Preserve required-preparer refusal and explicit missing overrides. Do not treat a public callback registry or frozen wrapper alone as proof that authority/callback accounting is correct. |
| t843 `domain/src/target-normalization/recording/{entry,parameters,target,policy}.ts` | Entry hook returns only target/parameters projection; Core retains entry identity/authority. Target guard uses the public recording decoding shape primitives. Policy validates actual element evidence and preserves generic command encoding (`String(type ?? "client-target")`, original metadata object). | Retain downstream ownership; review coupled Core recording ingress/validation/encoding. High on placement and extracted behavior; medium on full contract closure. |
| t843 production consumer changes, including `web-panel-host.ts`, `recording/proposals/late-target-wait.ts`, recovery-matrix compiler | Uses `fluxiq/runtime/native-execution` and `fluxiq/components/automation/importer`; extraction helper changes in the extension are comments. | Retain/adapt with settled Core exports. These cannot be cherry-picked independently onto an older Core package. High. |
| t843 extension/content/domain regression adjustments | Most target-normalizer imports point to the new owner. Frame/action tests expect `effect: "unacted"` and recoverable ambiguity; replay tests expect all four unacted attempts. Listing-in-repeat now obtains a published control handle and runs every step through real plan resolution. | Retain intent and assertions; requalify against the final retry/failure contract rather than reverting to one-attempt expectations. Medium-high. They assert observable behavior, not merely moved file locations. |
| t843 `domain/src/runtime/tests/{carried-service-repair,carried-row-service-repair,current-page}.ts` | Scripted provider reads the actual `core.current_view`, avoiding stale evidence. The missing-start case now supplies a valid page with a private reset address, asserts withheld state in trace, asserts no raw private value and no fabricated reset token. | Retain the honest fixture and privacy assertions. High on inspection. It intentionally stops covering malformed URL-less capture as a successful capture; preserve/add a distinct rejection test if that invalid case is required. |
| t843 new normalization/preparation/opaque-target tests | Original write/execute/read/match round trips and legacy recording/policy behavior now exercise actual downstream owners; integration tests run through Core IO and public runtime adapters rather than duplicating algorithms. | Preserve the cases and update imports/fixture wiring as APIs settle. High. Their existence does not establish that they ran or that the composed runtime passes. |
| t843 `scripts/structure-audit/rules/execution-options-copy.mjs`, adjacent tests | New compiler-based rule matches the original execution-option type/declaration and diagnoses spreads/rest that lose private companions. It is byte-identical to paired Core's rule. `run()` returns no findings when `CONFIG.executionOptionsCopy` is absent; downstream configuration does not set it. | Retain as synchronized Core mirror content, not claim a new active downstream gate. Medium-high. Configure only if downstream acquires the guarded option type/use. |
| t843 working-doc index portability, cache test, baseline, docs | Working-doc generator replaces stale machine drive paths with sibling-relative paths. Cache test removes source-shape assertions already covered through injected-operation behavior tests. Structural baseline reduces a persisted-run test entry from 6 to 4. | Preserve portable generator change and ratchet reduction; verify mirror parity and behavioral replacement when checking integration. Documentation/claims must be reconciled to the chosen implementation, not accepted as runtime proof. High. |
| t843 `packages/test-runner/src/live-llm/tests/live-llm-run.test.ts` | Expectations now keep the declared whole-build allowance when Core's ceiling is higher, and accept a lower explicit ceiling. No matching implementation change is in the t843 downstream diff. | Review as a separate allowance-contract regression against existing implementation and current paid-run policy. Medium; cannot infer correctness from an edited expected value. No paid test launched. |

## Coupling and completion limits

1. The new adapter uses public package entries, not Core source/deep build paths: `fluxiq/components/automation/importer`, `runtime/output-dispatch/preparation`, `runtime/recording/target-policy`, `client-gateway/recording/decoding`, `runtime/execution-observation/policies`, and `runtime/native-execution`. I inspected matching exports in paired Core's package manifest and representative contracts. Several are t843 APIs; reverting just one repository breaks the pair unless compatibility adapters accompany it.
2. The adapter owns web selectors/text/drawing/geometry interpretation; Core owns registered output identity, generic matching results, failures, confirmation, dispatch and recording authority. That separation is worth keeping. Review whether callbacks can alter parameters beyond the intended projection and whether registration/admission, provenance, override handling and observation all enforce the same contract.
3. Studio is not reduced to a UI by this downstream work. `rg -l 'fluxiq/automation-studio' domain/src -g '!**/tests/**'` found 90 production files still referencing its public facade. New normalization files still consume legacy Studio DTO types; the service tests still instantiate `AutomationStudioService`. Some are compatibility/type references, so this count is not 90 ownership violations. It does mean import renames alone cannot establish the end state.
4. No broad downstream browser execution/recording architecture was replaced in t843. Discarding all downstream code would discard tested historical semantics while leaving the larger Core ownership decision unresolved. Prefer preserving the old checkpoint and porting these bounded groups onto the agreed framework contracts. A full restart could still be justified by separate Core evidence, but its claimed speed advantage has not been measured here.
5. Do not promise runtime completion from existing component checks. The reset plan records a composed build stalled before start-state admission; this audit did not diagnose that stall or run it. Full integration still needs end-to-end author/build/test/repair/persist/replay evidence under the repository's paid-run and browser rules.

## Reproducible normalization comparison

Run in `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ` using PowerShell. This is text comparison, not a behavioral test. It compares each original top-level function with its moved counterpart, ignoring whitespace, `export` and the three public renames. It does not compare arbitrary import graphs or prove runtime equivalence.

```powershell
$legacy = (git show dev:packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts) -join "`n"
$files = 'normalize.ts','validate.ts','is.ts','fingerprint-signal.ts','sensitive-key.ts'
$parts = $files | ForEach-Object {
  Get-Content -Raw -LiteralPath ('../!FluxIQWebExtension/domain/src/target-normalization/' + $_)
}
$current = ($parts -join "`n").Replace('normalizeWebElementTarget','normalizeAutomationStudioElementTarget').Replace('validateWebElementTarget','validateAutomationStudioElementTarget').Replace('isWebElementTarget','isAutomationStudioElementTarget')
$pattern = '(?ms)^(?:export )?function (?<name>\w+)\([^\n]*.*?^\}'
$oldMatches = [regex]::Matches($legacy, $pattern)
$newMatches = [regex]::Matches($current, $pattern)
$results = foreach ($old in $oldMatches) {
  $name = $old.Groups['name'].Value
  $new = $newMatches | Where-Object { $_.Groups['name'].Value -eq $name } | Select-Object -First 1
  $a = ($old.Value -replace '^export ','' -replace '\s+','')
  $b = ($new.Value -replace '^export ','' -replace '\s+','')
  [PSCustomObject]@{ Function=$name; SameBody=($a -eq $b); Found=[bool]$new }
}
$results | Format-Table -AutoSize
```

Observed result: 25 rows, every `SameBody` and `Found` value `True`. Function set includes public guard/normalize/validate; fingerprint/candidate/selection compaction; all sanitizers/readers; signal/sensitive-key helpers; and issue creation. The first version of the comparison probe failed before execution because PowerShell does not allow piping directly from the `foreach` statement used there (`An empty pipe element is not allowed`). Assigning the loop output to `$results` fixed the probe; no files were written by either attempt.

## Inspection commands and observed results

All git commands were read-only, without fetch. Commands below ran in the downstream checkout unless explicitly labeled Core.

- `git status --short` -> empty. `git log -15 --oneline --decorate` -> HEAD `6e0e947a`, pushed task `460a5af6`, dev merge `d6e5448c`; `git rev-list --count dev..HEAD` -> `7`.
- `git merge-base dev HEAD` -> `d6e5448c91d2fff131e891a0a41f084bcea930e8`.
- `git diff --stat dev...HEAD` -> `105 files changed, 2845 insertions(+), 174 deletions(-)`; `git diff --name-status dev...HEAD` -> inspected all changed path names.
- `git show --no-patch --pretty=raw d6e5448c` -> first parent `c9056f1a88fb552b25011f753e74599ba0b80c95`, second parent `a04bcf56b513686ecdae220b7cbf36c888d9047f`.
- `git diff --stat d6e5448c^1..d6e5448c` -> `112 files changed, 1066 insertions(+), 359 deletions(-)`; `git show --stat --oneline a460ef90` -> principal t842 ownership/import change.
- `git diff c9056f1a..dev -- domain/src/runtime/host-runtime.ts domain/src/output-nodes/native-runtime.ts domain/src/output-nodes/definitions.ts domain/src/element-fingerprint/index.ts apps/extension/src/content/identity/score.ts scripts/structure-audit/config.mjs packages/test-runner/src/flow-lane/persisted-flow-run.ts` -> reviewed concrete t842 ownership/protocol changes.
- `git diff dev...HEAD -- <classified paths>` and `Get-Content -LiteralPath <representative files>` -> inspected normalization/preparation/recording bodies, manifest/bundle wiring, target round trips, retry/frame expectations, current-view/repair fixtures, allowance tests, cache-test and tooling changes described above.
- Core `git show dev:packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts`; the comparison script above -> all 25 moved function bodies equal. Core `git show dev:packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts` and `.../runtime/service/object-documents.ts` -> original preparation and recording projection semantics reviewed against downstream bodies.
- Core `git show --no-patch --pretty=raw dev` -> merge `ff8eb0be8`, first parent `16b5043c5b986cb5a31b71bbabf4d4c11c289819`; inspected Core importer bundle contract, output-preparer/result contracts, matcher helper, callback registry and public package export entries.
- `Get-FileHash -Algorithm SHA256 -LiteralPath scripts/structure-audit/rules/execution-options-copy.mjs,../!FluxIQ/scripts/structure-audit/rules/execution-options-copy.mjs` -> both `D1429D98164FB04CEBFEFF36FB55D23776FA50851F4A6FF0F7121FD9482FC19F`.
- `rg -n 'executionOptionsCopy|execution-options-copy' scripts/structure-audit` -> rule/test references, no downstream configuration; inspected rule's unconfigured early return.
- `rg -l 'fluxiq/automation-studio' domain/src -g '!**/tests/**' | Measure-Object` -> count `90`.

## Return contract

Outcome: Done
Changed: Owned report only.
Validation: Read-only git/history/body comparisons above -> concrete salvage groups, correct pre-t842 baseline and 25 identical moved function bodies established; no tests/builds run per brief.
Not verified: Runtime behavior; complete package-export compatibility; composed start-state stall; all Core changes; full callback/authority closure; browser behavior; time/cost advantage of a restart.
Report: docs/working/runtime-ownership-reset-plan/reports/downstream-salvage.md
Notes: Preserve web semantics; settle paired public hooks before integration. Current dev already contains t842. No git mutation, provider call, test or build performed.
