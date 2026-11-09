# Agreeing acted witnesses resolve (run-mw4dsh8i-3fb9dc39)

## Outcome
Done.

## What changed
Paths under `!FluxIQWebExtension/domain/src/runtime/llm-evidence/plan-resolution/control-intents/` in t876.
- `absolute.ts` ~57-75: comment extended with the why (run id); several acted witnesses now resolve when every one has an intent and all agree with each other and with every match (`sameWebPlanControlIntent`). Zero witnesses, a missing intent or any disagreement returns ambiguous.
- `tests/host.ts`: `capture` option `leading?: number` prepends filler elements so the control's handle is `t(2+leading)`; dialog parent index and the shadowHosts key follow it.
- `tests/resolution.test.ts`: two new tests after the "identical observed controls" test: "the same control acted on from two pages with one meaning resolves" and "two acted sources that disagree stay ambiguous".

## Commands run
- `DOMAIN_TEST_BUILD_LABEL=lane-b-w1 node scripts/test-domain.mjs control-intents` -> tests 21, pass 21, fail 0 (both new tests `ok`).
- `DOMAIN_TEST_BUILD_LABEL=lane-b-w1 node scripts/test-domain.mjs plan-resolution` -> tests 319, pass 319, fail 0.

## Not verified
Typecheck and whole-package tests not run (as instructed). Live refusal not reproduced.

## Open questions
None.
