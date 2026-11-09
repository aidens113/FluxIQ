# Cited row by position (t875 lane A)

Outcome: Done

## What changed and why
A judge's yes citing rows "1".."4" was refused because Core matched a cited row only by label. Under `packages/fluxiq/src/runtime/result-verification/cited-yes/`:
- `citation-refuted.ts`: when no stored row's label matches the cited row, a cited row that is a whole positive number (`3`, `row 3`, `#3`) resolves to the Nth stored answer row (1-based, order the rows are held). A label match always wins. Column and value are still checked exactly. A position out of range gives the same "is no row the result holds" sentence, so `yes-citations.ts` still skips it when rows are incomplete (that file is unchanged).
- `index.ts`: header comment says positions are accepted.
- `tests/yes-citations.test.ts`: new block. Rows 1..4 with matching values pass. A position whose cell differs is refuted. A position past the last row is refuted when complete, and not refuted for a sample. Position 0 is refuted. A numeric label beats a position. A label still matches.

Prompt sentence in `llm/diagnosis-instructions.ts`, now:
"When you answer yes, list in diagnosis.checked the stored rows you checked, each as its label in row (the row's value in its first stored column, such as a name or title, never its position), a stored column in column and that row's own value there in value, the cell that shows the request asks for it; Core looks each up in the stored rows, and a yes citing a cell the result does not hold is not taken as a yes."

Tests that asserted the old sentence or its digest, updated to match (inside llm/, not in the owned list):
- `llm/deepseek/tests/system-prompt.test.ts` (CHECKED constant)
- `llm/deepseek/tests/system-prompt-pins.json` (two pinned prompts)
- `llm/tests/flow-less-diagnosis.test.ts` (two sha256 digests, for `loop_verification` and `loop_verification` with `buildTest`). The Flow-less and `runtime_diagnosis` digests are unchanged and still pass.

## Commands and results
- `npx vitest run src/runtime/result-verification/cited-yes src/runtime/result-verification/verdict src/runtime/llm` (in packages/fluxiq): first run 255 files passed, 1 failed (flow-less-diagnosis digest, caused by the sentence change). After updating the digests, `npx vitest run src/runtime/llm/tests/flow-less-diagnosis.test.ts src/runtime/result-verification/cited-yes` gave 2 files, 13 tests, all passed (cited-yes: 10 tests).
- `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit` (packages/fluxiq): no output, exit 0.
- `node scripts/structure-audit.mjs` (repo root): "structure-audit: passed (530 warning(s), 1097 baselined)".

## Not verified
- I did not re-run the whole verdict and llm directories after the digest fix. Only the first run covered them (all else passed).
- Not run against a live paid judge.

## Open questions
- Digests and pins are edits to a judge's words, as the test comment says is a decision. The supervisor should be aware.
