# Keep-going table and attempt purse (t861)

## Outcome
Done. 33 tests pass. `check` and `structure-audit` report errors only in other workers' files (listed below); none in mine.

## The table as built (`S/runtime/answer-first/keep-going/`)
`automationStudioAnswerFirstNext({ end, aborted, purseRefused, achieved, backoffs })`, in this order:
1. `aborted` -> `stopped`
2. `achieved` -> `achieved`
3. `purseRefused`, a thrown `AutomationStudioLlmBuildPurseRefused`, a thrown provider error `llm.provider_balance_exhausted`, or a loop failure whose `providerUnavailable.codes` has that code -> `budget_out` (`purse` / `empty_balance`)
4. loop code `provider_unavailable`, or a thrown timeout / network error / rate limit / HTTP 5xx -> `backoff`
5. everything else -> `fresh_round` with a generic `why` and `note { why, carriedOver: [page, draft, acts, tried] }`: all other loop codes (a closed `Record` over `AutomationStudioLlmEvidenceLoopFailureCode`, `satisfies`, so a new code fails compile), an `ok` loop that did not achieve, any other thrown error (auth failed, 4xx, plain Error, string), and any unknown code.

`note` and `why` carry only Core's fixed words, never a message, page text or model words (test checks a thrown message does not appear). A rejected key or 4xx is a `fresh_round`, not an ending, by the hard rule; loop detection and the purse bound it.

## Backoff
5 s doubling, cap 60 s (5, 10, 20, 40, 60, 60, ...); never runs out, costs nothing. `say`: "The model service is not answering, so I am waiting N seconds and then asking again; Stop works at any time." Driver passes `backoffs: 0` after an answer.

## Purse (`S/runtime/answer-first/attempt-purse/`)
- `AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD = 5`.
- `automationStudioAnswerFirstBudgetUsd({ flowSetting?, env? })` = min of $5, the Lab-scoped ceiling (`resolveAutomationStudioLlmTestRunCostCeilingUsd`, which reads only with `FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`, default $0.10) and an explicit Flow setting. A higher explicit value does not raise $5.
- **Explicit vs default.** New Flows get `maxEstimatedCostUsdPerRun: 0.25` written as a default (`flows/authoring/model/flows.ts:263`, `defaultFlowSettings`), so the stored value cannot tell a chosen $0.25 from the default. `adaptationPolicyFromFlowMetadata` just copies whatever number is stored. The only product-default marker is the value `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD` (0.25), so I treat exactly 0.25 as not explicit. Cost: a person who deliberately sets exactly $0.25 gets $5. Lab-scoped Flows are written with the env ceiling (`flows/creation.ts`), which is explicit and held either way.
- `automationStudioAnswerFirstKeepBackJudge(purse, { calls?: 1, summaryInputTokens? })` calls `keepBackForJudging` with `build-call-reserves` judge figures (8,000 in, 1,250 out). The reserve holds each judge call at the largest judge call priced so far, not at a decision, so decision growth does not under-hold it. Before a judge has been priced it holds the fixed 8,000-token figure, which does not grow with a large summary, hence `summaryInputTokens` (the driver should pass the summary's measured size).

## Commands run
- `pnpm.cmd exec vitest run src/runtime/answer-first/keep-going src/runtime/answer-first/attempt-purse --minWorkers 1 --maxWorkers 2` -> 2 files, 33 tests passed (after fixing my test's settle shape).
- `pnpm.cmd --filter fluxiq check` -> 3 tsc errors, all in `runtime/llm/node-tools/replay/{draft,span}.ts` and `runtime/llm/loop-configuration.ts` (the forward worker's files). None in mine.
- `node scripts/structure-audit.mjs` -> 14 violations, all in `framework/automation-service/service/answer-first/rows/**` (depth, swallowed failure) and `runtime/llm/node-tools/replay/span.ts` (statement packing). None in mine.

## Not verified
Real provider error shapes for an empty balance mid-loop (I read the loop's code and the thrown error class, not a live run); whether the loop ever reports balance via `providerUnavailable.codes`, handled but unconfirmed. The check and audit do not pass overall until the other workers' errors are fixed.

## Open questions
None.
