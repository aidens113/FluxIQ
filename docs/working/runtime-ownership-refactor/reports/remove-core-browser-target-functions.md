# Remove Core browser target execution

Dispatch: [remove-core-browser-target-functions](../briefs/remove-core-browser-target-functions.md). SOURCE + TESTS FROZEN; all worker readers ended. Native secret and prior policy sources stay frozen.

Core `model/action-element-target.ts` now contains only its seven complete original serialized type aliases. The public normalize/is/validate functions and every private interpretation/sanitization helper are deleted. No hidden Core copy or Core-to-Down reexport remains. Down's existing production functions were not edited.

`model/validation/recording.ts` delegates to the canonical structural validator, taking the existing optional `RecordingTargetValidationPolicy<ActionTarget>` argument. Absence uses neutral no-target-interpretation methods. The supplied recording/environment never selects code. Sequence/confidence/time/evidence/state/visual validation remains canonical and unchanged; original explicitly supplied receiver/arguments/errors are preserved. No Source purity or SDK registration was added.

## Complete case transfer

Paths below are relative to Core `src/programs/automation-studio` or Down `domain/src`. Original inputs and expected string/number/template literals remain intact; Vitest assertions become Node strict assertions, with full-object equality stronger than the original partial match where the complete fixture is known.

| Original Core case | Actual Down destination |
| --- | --- |
| `model/tests/action-element-target.test.ts`: normalizes legacy selector-style targets | `target-normalization/tests/legacy-element-target.test.ts`, same case |
| sanitizes canonical targets while preserving matching signals | Same destination/case |
| validates persisted element targets on recording actions | Same full original recording/action input, explicit actual `webRecordingTargetPolicy`; original invalid-bounds and invalid-confidence expectations |
| requires at least one durable fingerprint signal | Same destination/case and empty-fingerprint code |
| enriches fingerprints from action visual targets | Same destination/case |
| type action identity comes from element, never typed text | Same destination/case and privacy literal |
| clicked element text/identifiers/implied role | Same destination/case |
| drawing token through every shape; unknown fields dropped | Same destination/case, all candidate/metadata/length/privacy assertions |
| drawing alone is not an identifying signal | Same destination/case |
| authored role precedes implied role; standalone text behavior | Same destination/case |
| `tests/opaque-target-execution.test.ts`: repaired target survives real execution | `tests/opaque-target-execution.test.ts`, full original patch/Flow/host/attempt input; actual web normalizer/validator and matching identity |
| handle-only target cannot identify an element | Same Down destination, both original opaque guard and actual normalization-null assertions |
| repaired identity survives selector renumbering/decoy | Same Down destination, actual calibrated web matcher and both wanted/decoy assertions |
| `runtime/tests/service-recordings/tests/proposals.test.ts`: mapper element-target proposal normalization | `target-normalization/tests/recording-proposals.test.ts`, complete real Service/mapper/persistence setup and all three explicit/typed-text/bare-locator inputs, exact expected fingerprints and privacy assertions |

The old Core model browser test is deleted after all ten cases move. Core opaque execution retains its original generic carry/write/run/immutability/handle checks and all five execution fixture functions; its browser-normalization and matching claims run downstream. The handle-only structural acceptance case is named for its Core responsibility. All nine remaining Core proposal case bodies are byte-identical. Existing Core model/visual/framework-state compatibility tests are unedited.

The proposal case no longer copies a fixture normalizer or invokes a removed Core function: the original bundle registers the actual `normalizeWebRecordingCandidateParameters`. Its three original complete recording inputs and fingerprint/privacy oracles are preserved. Core never imports this implementation. Source/case map: `.fluxiq/refactor/remove-core-browser-target-case-map.json`; exact originals and owned paths are in adjacent `-originals.json` / `-owned.json`.

## Observed checks

- Core source search `rg -n 'normalizeAutomationStudioElementTarget|isAutomationStudioElementTarget|validateAutomationStudioElementTarget' packages --glob '*.ts' --glob '*.tsx'` -> zero matches after deletion/transfers. This includes actual value/type consumers; only the old validation wrapper was a production caller before removal.
- From Core root: `node .fluxiq/refactor/remove-core-browser-target-parity.cjs` -> seven original passive types unchanged; fourteen transferred cases, 246 original input/oracle literal nodes unchanged; nine remaining Core proposal bodies and five Core execution fixtures byte-identical; zero failures.
- `node .fluxiq/refactor/remove-core-browser-target-local.cjs` -> transferred Down model cases 10/10 and new Core wrapper cases 4/4 passed, exit 0. Exact source-local value bundles: 105 wrapper inputs / 133 Down inputs, zero active mutable-owner edges. Wrapper cases cover no target/domain getter reads, generic time/confidence refusal, original explicit receiver/tuple/issue identity and original thrown error.
- `node .fluxiq/refactor/domain-target-hooks-bytes.cjs` -> 110 original normalization +72 recording projection +54 output preparation +9 validation =245 exact JSON/error cases, zero mismatches; actual public-source bundle 44 inputs. Down production authority remains unchanged.

Held, not claimed passed: Down real opaque roundtrip three cases and real proposal case/three inputs; retained Core opaque/proposals and unchanged model/visual/compatibility subjects; strict source/types and FULL-context scoped audits; normal rebuilt/guarded package integration. Prepared `remove-core-browser-target-types.cjs` / `-scoped.mjs` do not filter context files or hide destination barrels and have not run. Root/A scope/ingress/start/locked Service/capture integration is separate and was not modified.

## Compatibility

The three old executable Core exports intentionally disappear under the reserved below-1.0 paired minor migration. Web consumers use the existing public Down normalizer/guard/validator or actual registered recording policy. Rich legacy schemas remain passive and complete; no domain is inferred from target, selector, URL or submitted environment. Default standalone Core recording validation is structural; browser refusal remains explicit Down policy and Root's registered stored-scope path. Current built declarations/currency are not claimed until Root rebuilds.

Outcome: Partial
Changed: Two Core sources, three retained/new Core tests, one deleted Core browser test; three new Down test files; own report. No Down production, SDK, scope, baseline or shared-doc edits.
Validation: Closed Core4 +Down10 passed; fourteen-case/246-literal transfer proof; seven passive types unchanged; original/current245 byte/error cases matched; source search zero deleted function references.
Not verified: Held real Service/repair consumers, types/full-context audit, normal built packages, scoped start/append/restart behavior or live browser.
Report: docs/working/runtime-ownership-refactor/reports/remove-core-browser-target-functions.md
Notes: SOURCE FROZEN; all worker readers ended. No git, agents, broad suites/builds/providers or native secret edits.
