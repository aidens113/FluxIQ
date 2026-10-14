# t557-a13-purse-split: build purse split by responsibility

## Outcome

Done. `llm/build-purse/purse.ts` is down from 476 lines to 308. Its parts now sit in focused files in the same directory. Behaviour is unchanged. No test was edited, imports included: every test that names the purse passes as it is.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/llm/build-purse/`.

- `types.ts` (new): the purse's shared contracts, moved out of `purse.ts` word for word: `Refusal` (with its private cost-refusal member), `Price`, `Call`, `Judging`, `Hold` and `Options`. It also adds `AutomationStudioLlmBuildPurseHeld`, which was a private alias before and is now named because `purse.ts` and the barrel use it. The code-structure rule puts types shared across a directory in `types.ts`.
- `settlement-ledger.ts` (new, holds and settlement): `AutomationStudioLlmBuildPurseLedger` takes over the old private `holdOwn` body and its state: pending holds, the settled total, the largest reported cost, breach and overshoot counts, and the call slots (`AutomationStudioLlmBuildCallAllowance`). It also takes the header paragraph explaining why a reply is held at a reserve.
- `judging-reserve.ts` (new, judging reserve): `AutomationStudioLlmBuildPurseJudgingReserve` takes over the kept-back judging, the largest judge hold, the provider price and `priceUsd`, along with the t254 judging header paragraph. `note(call)` records the call's price and its judge worst case at the same point in `holdFor` as before. Neither value is read in between, so the order of effects is unchanged.
- `cost-refusal.ts` (new, refusal): `automationStudioLlmBuildPurseCostRefusal(figures)` builds the `llm_budget.run_cost_limit` object. Its keys come out in the same order and are left out under the same conditions as the old inline object.
- `allowance-book.ts` (allowance carving): gains `carvingRefusal(request, from)`. It holds the validation that throws (brief and role missing, amount negative or not finite, brief already open) and the `allowance_unavailable` refusal, with the same checks in the same order. The purse still checks `closed` first and still constructs the allowance itself, so no import cycle appears. The t534 allowance-chain header paragraph moved here.
- `epsilon.ts` (new): the shared `1e-9` slack constant. It is now used by purse, ledger and allowance book.
- `purse.ts`: keeps the class and the "why a build needs one" / "one purse per Flow" / "unpriced call" header. It now delegates to the parts above, and a short "Its parts" paragraph points to them. `breaches` and `overshootUsd` are now getters that read the ledger's figures; nothing in `src` assigns them (checked with grep).
- `refused.ts`, `run-frame.ts`, `harness-hold.ts`: their type imports moved from `./purse.ts` to `./types.ts`. No logic changed.
- `index.ts`: one line added, `export * from "./types.ts"`. Every name it exported before is still exported. The new internal parts (ledger, reserve, cost-refusal, epsilon) are not exported, so the public surface grows only by the type `AutomationStudioLlmBuildPurseHeld`.

## Commands run and observed results

- Before the change: `npx vitest run src/programs/automation-studio/runtime/llm/build-purse` (in `packages/fluxiq`) -> 5 files, 39 tests passed.
- After the change: `npx vitest run <the 34 test files from grep -rln "build-purse|BuildPurse" src --include=*.test.ts>` -> `Test Files 34 passed (34)`, `Tests 298 passed (298)`, exit 0.
- `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`) -> no output, exit 0.
- `node scripts/structure-audit.mjs` (repo root) -> `structure-audit: passed (350 warning(s), 1156 baselined)`. The only build-purse line is a new advisory warning: `build-purse/: 16 source files is past the 15-file advisory threshold` (the hard cap is 25). `purse.ts` no longer appears in the file-lines warnings.

## Not verified

- The full package suite, `pnpm check` and `pnpm build`: not run, under the narrow-checks rule.
- Downstream (web extension) consumers: not checked. Every name they could import from the barrel is still exported.

## Open questions or contradictions found

- The directory now has 16 source files, one past the 15-file advisory (cap 25). Two ways to clear it: fold `epsilon.ts` into another file, which would break "one export per file", or move the purse's parts into a `purse/` subdirectory later.
- Comments in `flow-bootstrap/creation-spend/record.ts` and `unfinished-build/{phases,reserve-judging,round-funding}.ts` point to `../../llm/build-purse/purse.ts`. Those pointers are still valid, because `keepBackForJudging` and the ceiling explanation remain reachable from that file. They are outside this brief and were not touched.
