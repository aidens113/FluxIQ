# Re-ask the Flow-less judge on a refuted cited yes

Outcome: Done

## What changed and why
- `packages/fluxiq/src/runtime/result-verification/flow-less/judge.ts`: the judge now loops inside one check, one deadline. When the reply is a yes whose citations Core refutes (`core.result.yes_citation_refuted`), it reads Core's refutation sentences from `verdict.yesCitations.refuted` and calls `input.run` again with the same summary plus a `citationsNotMatched` field. It repeats while the set of refuted sentences is new; if a set repeats (the identical unmatched citations), it returns the existing `unsure`. A yes whose citations hold is a yes; a no/unsure from a re-ask is that verdict. Every re-ask goes through the same `input.run`, deadline, cancellation and purse/balance reading as the first call (verified by test 3). Header comment updated.
- `flow-less/tests/judge.test.ts`: added `scriptedInOrder` helper and three tests; the existing "holds a yes citing a cell the rows do not hold" test now expects 2 calls (identical citation repeated, no third call).

## Words added for the judge (generic, no site/product/person names)
Field `citationsNotMatched` on the result summary:
- note: "Your last reply cited cells Core could not match in the stored rows. Judge again, citing only cells the stored rows hold."
- notMatched: Core's own sentences, screened (e.g. `The cited row "..." is no row the result holds.`)
- validCitation: "A citation names a row by its label (its value in the first stored column, such as a name or title, or its 1-based position among the stored rows), then a stored column, then that row's own value in that column, written as the rows hold it. Cite only cells the stored rows contain, or cite nothing."

## Commands and observed results
- `npx vitest run src/runtime/result-verification src/framework/automation-service/service/answer-first/completion` (packages/fluxiq): 208 files passed, 1637 tests passed. (A first run failed on a bad string literal I introduced in judge.ts; fixed and rerun.)
- `pnpm.cmd --filter fluxiq check`: ran tsc, no errors printed.
- `node scripts/structure-audit.mjs`: "passed (531 warning(s), 1097 baselined)".
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`: all four Done, exit 0.

## Not verified
- No live run. The completion check's behaviour on the re-asked verdict was covered only by the existing completion tests, not a new one.
- "Changing sets" has no cap besides deadline/purse (repeat of any earlier set also stops it).

## Open questions
None.
