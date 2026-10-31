# Shared acceptance fix: usable read identity and explicit undefined

Outcome: Done within the three assigned files. Source is frozen for the lead's focused rerun. No checks/tests/builds/audits or browser/API calls ran during parallel edits.

## Cause and distance travelled

The lead reported the first selected domain acceptance run reached 142 passes out of 143, with one new authoring readsWords fixture failure, plus four domain type errors owned by separate lanes. This worker did not run or independently re-verify that command/output.

The shared matcher admitted the stale identity by counting all saved word signals, although comparison deliberately ignores those words when readsWords is true. A target with only kind plus its changing value therefore passed initial eligibility, could match no candidate, and incorrectly returned gone. Simply filtering the resulting words signals would also be insufficient: the identity counter's lone-class rule can count a class only because the words were present.

The initial eligibility check now removes every ignored word field from a private fingerprint copy, then recomputes the existing identity signals and their class rule. Fewer than the unchanged minimum usable signals returns unmatched/unidentifiable before matching or absence is considered. Record/context/position/selector/handle evidence is not promoted to an extra signal. Strong readsWords targets with two stable non-word signals keep their successful matching semantics.

The descriptor builder explicitly writes `recordIdentity:undefined` when none exists. Its optional type now truthfully permits that value under exactOptionalPropertyTypes. No data was dropped and no other contract was loosened.

## Exact changed paths

Relative to private downstream `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQWebExtension`:

- `domain/src/runtime/llm-evidence/elements.ts`: `DescribedEvidenceElement.recordIdentity?: WebTargetRecordIdentity | undefined`.
- `domain/src/runtime/target-reacquire/element-match.ts`: initial source eligibility uses private `usableSignals`; words are removed before re-running the existing signal counter. Matching/safety floors and existing record gates remain unchanged.
- `domain/src/runtime/target-reacquire/tests/element-match.test.ts`: appended direct weak readsWords identity cases with no candidate and with a current candidate, including the lone-class dependency; appended a strong two-non-word-signal readsWords success case.

Every original and lead-written record oracle is unchanged. The native authoring fixture, native type fixes, Root's structure-detect constructor, Core and every other owner path were untouched.

## Authored acceptance, not executed

The new direct tests require unmatched/unidentifiable for a kind-plus-value identity even on a complete negative candidate set, and require the same for kind-plus-value-plus-lone-class. A target with kind plus an independent test ID must still find the same control after its words change.

Lead should rerun the focused matcher selector, the separately corrected authoring retry selector and affected domain types once all parallel owners freeze. Suggested narrow selector: `pnpm --filter @fluxiq-web-extension/domain test -- runtime/target-reacquire/tests/element-match runtime/llm-evidence/node-run/retries/tests/reacquire`. No passing rerun or type result is claimed here.

Outcome: Done
Changed: three exact assigned source/test paths above; shared-acceptance-fix.md report
Validation: not run (parallel-edit brief forbids checks/tests/builds/audits)
Not verified: types/runtime/browser; new direct tests are authored only
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/shared-acceptance-fix.md
Notes: Source frozen. Weak readsWords identity is unidentifiable before absence; the two-signal floor is unchanged. Explicit undefined is limited to its truthful descriptor field.
