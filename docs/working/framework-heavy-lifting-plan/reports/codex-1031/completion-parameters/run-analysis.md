# Run analysis — run-mvwx2cob-3454e2ce

## Observed outcome and distance
- **Evidence:** run summary verdict is `failed`; run ended after 326.817 s. Core's build outcome is `failed` after 297.041 s, with a five-step incomplete draft. It never reached an accepted Flow/oracle or judged replay.
- **Evidence:** the completion refusal is a hard call allowance ending (panel says the configured 26-call limit), with recorded issue codes `flow_bootstrap.evidence_budget_exhausted` and `web.handle.ambiguous:parameters`. It is not a cost ceiling or provider balance refusal.
- **Evidence:** the captured policy is `maxCalls=26`, `maxCallsPerRun=26`; estimated-cost ceilings are $5 (run and build). Observed spend is $1.7107277 total, comprising $1.6039411 build and $0.0088205 chat plus $0.0979661 in two malformed paid replies (rounding from run ledger). This leaves about $3.29 of the configured cost ceiling, but money cannot buy another decision after the call/evidence allowance is spent. The call limit is the binding limit.
- **Accounting detail:** evidence-loop metadata records 24 provider decisions, 18 tool calls and 838,071 input / 20,415 output tokens. Overall run metadata counts 25 model calls including one chat call; the build subrecord counts 24. The call allowance remained 26, but this is not a free exploration budget: Core's build purse can keep calls for the final judging pair. Treat “26” as the configured limit, not 26 completed evidence decisions. The retained trace does not include the exact refusal's spent/pending/kept-back counters, so the precise purse arithmetic at the refusal is not independently recoverable here.
- **Policy/execution evidence:** no browser/fixture infeasibility is established. The run stopped before the flow was accepted and before its oracle/replay.

## Final trial steps (safe fields only)
- **Evidence:** 0066 input records `replay=reset` (no node ID is present); 0067 is `web.output.browser-navigate`, 0068 and 0069 are `web.output.dom-click`. Step 0068 returned `core.replay.remembered` because the prior action target was gone.
- **Actual failure:** 0069 is `web.output.dom-click`, `core.replay.failed`, reason `handle_names_several_now`; user-facing result says its parameters could not be resolved. This is an ambiguous current handle/parameter resolution on a click, not an absent target and not an oracle/data failure.
- 0070 is `web.output.dom-extract_list`, result `core.replay.changed`, with `pass=1` in step metadata: it read zero where this trial previously read three. The raw page/rows are intentionally not reproduced.
- 0071 is `web.output.dom-next_page`, result `core.replay.failed`, reason `outcome_uncertain`; the saved result says whether it took effect was uncertain, and it was not made again. This establishes the observed stop only. The saved evidence does not establish this node's effect classification or whether withholding a retry was correct. It cannot establish that the page lacks more results.
- **Generic contract interpretation:** the click result surfaces current handle ambiguity; the list read reports changed output; the next-page result reports uncertain outcome. Whether the last action is classified as a lasting act, and therefore whether withholding a retry was correct, remains unverified. No evidence supports weakening the oracle or changing the task.

## Two malformed provider decisions
- **Evidence:** steps 0011 and 0013 are Anthropic `claude-sonnet-5-5` evidence-tool decisions, attempt 1, each `llm.provider_malformed_response`, non-retryable. Both carry usage (26,470 in / 1,839 out; 26,919 in / 1,613 out) and recorded costs ($0.0495518; $0.0484143). Thus the requests reached the provider and produced paid output; credentials/authentication are not the cause.
- **Protocol contract:** both requests asked for Anthropic `json_schema` output whose only top-level field is string `result_json`; Core then requires that exact one-field envelope and parses the contained JSON against the evidence-decision schema. The paid malformed-response path is in `runtime/llm/anthropic/provider.ts` `parseAnswer`, with transport/envelope handling in `runtime/llm/anthropic/messages.ts`.
- **Limit of saved evidence:** provider reply contents were not persisted in the safe step record (the error has no reply payload). Therefore we can classify them as malformed structured output at the provider-answer/parser boundary, but cannot say whether each missed the outer `result_json` shape or contained invalid/nonconforming inner JSON. No model text is reproduced.

## Relevant evidence/source paths
- Run bundle: `fxlab/t833-claude/lab-ext/test-runs/instances/t833-claude-company-website-slot-1/run-mvwx2cob-3454e2ce/summary.json`
- `snapshots/live-llm.json`; central `lab-runs/2026-10-31/run-mvwx2cob-3454e2ce/steps/0011-decide`, `0013-decide`, and `0066`–`0071` step JSON.
- Core: `packages/fluxiq/src/programs/automation-studio/runtime/llm/anthropic/provider.ts`, `runtime/llm/anthropic/messages.ts`, `runtime/llm/build-purse/judging-reserve.ts`, `runtime/llm/build-purse/purse.ts`.

Outcome: Done
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/run-analysis.md`
Validation: Read-only inspection of the listed run JSON and cited Core source; no tests or live commands run.
Not verified: Exact purse refusal counters and the structural content of either provider reply, because the saved safe trace omits them.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/completion-parameters/run-analysis.md`
Notes: 1) Raw page/model content, selectors and credentials were not emitted. 2) Run failure is not evidence the fixture is impossible.
