# Web retained-control classifier

Outcome: Done (source authored; targeted tests pass).

Implemented `collectWebLlmControlIntents(binding)` using the frozen collector alias and public Core companion type. The collector indexes retained evidence handles once, uses bounded same-frame ancestry, and produces frozen copied meanings. It never reads model arguments, saved dialog context or browser state. Non-controls do not contribute container prose; descendants inherit their nearest acting control and accepting acting ancestors defeat nested close glyphs/controls.

The moved English vocabulary preserves legitimate authoring declines and accepting labels, including Continue shopping, Continue without accepting and the full-price refusal. Conjoined additional positive acts stay accepting. Bare consent labels remain accepting without `responseOnly`; the bit requires a closed positive response and actual observed same-frame consent-layer membership. Covered-by evidence, unknown layers, hidden members, invalid/cyclic ancestry and another frame provide no exception. Offers defeat the bit. No automatic-clear vocabulary, preferred-option enforcement or permission/effect claim changed.

Source files: `domain/src/runtime/llm-evidence/control-intent/{acting-control,collect,consent-response,context,control-words,membership,wording,index}.ts`; frozen contracts unchanged. Tests authored under that folder's `tests/{classifier,context}.test.ts`; architecture doc `docs/architecture/control-intent.md`.

Validation after lead's fresh-SDK release: from `domain`, `$env:DOMAIN_TEST_BUILD_LABEL='t833-control-intent-classifier'; node scripts/test-domain.mjs runtime/llm-evidence/control-intent/tests/classifier.test.ts runtime/llm-evidence/control-intent/tests/context.test.ts` -> exit 0, `# tests 11`, `# pass 11`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`, `# duration_ms 121.3551`; command wall time 4.9790743 seconds. Before running, fixed only the four requested statement-packing violations in context.test.ts, with no semantic changes. Actual-sanitizer tests cover legacy matrices, the exact 80-character boundary, consent answer without a reject, offer/conjunction/nested-control negatives, sanitized modal and parent-cover membership, coverage-only negatives, other frames/layers, malformed ancestry, neutral/navigation behavior, retained-handle filtering and frozen/copy behavior.

Not verified: compiler compatibility, structure audit, target-store integration and Core acceptance. Root owns types/audit. No source transport/shared working docs/Core source/git/package build/full suite/provider/browser/.env operation performed. The labelled test runner generated only its isolated test bundles.

Source frozen after this report. Wait for lead release or review before any further edit or validation.
