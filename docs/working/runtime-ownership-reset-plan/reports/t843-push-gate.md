# t843 push gate

Outcome: Partial

## What changed
Split every multi-statement line in the five test files onto its own line (formatting only). statement-packing now reports nothing.

## Not done
- route-state/delta.ts and screen-situation.ts imports left untouched. llm/index.ts does not export automationStudioLlmEvidenceCanonicalJson (evidence-loop.ts exports only some evidence-loop-decision symbols), and llm/index.ts exports node-tools/, whose replay.ts value-imports route-state/signatures: a barrel import from route-state creates a value cycle. screen-situation.ts's own comment already says it imports the harness leaf to stay out of that cycle (its second direct import, llm/harness/evidence-screen.ts, is the other flagged one). Needs a decision: move the canonical-JSON helper to a neutral leaf/barrel, or baseline.
- New unrelated failure: [directory-files] service/project-build/tests/ has 26 files (limit 25) because of untracked zz-dev-copy-probe.test.ts, not mine and not owned; probably a leftover probe to delete.

## Commands
- `node scripts/structure-audit.mjs` -> FAIL: 3 violations across 2 rules (directory-files x1, imports x2).
- vitest on the five files -> 4 files passed, 1 failed; 56/57 tests passed. Failure: implicit-clocks.test.ts "refuses a replacement native random getter used by a built-in fallback" (AggregateError execution_observation.cleanup_failed). Same failure on the unedited HEAD copy (10/11), so pre-existing.
