# Native judge schema, key-up repair, decide feedback (Step A)

Outcome: Done. Paths under packages/fluxiq/src.

## Item 1: native schema (the fallback route, not output-schema.ts)
- metadata grep: runtime/llm/deepseek/tests/output-schema.test.ts pins `metadata` as a member of the diagnosis and
  verification schemas, and DeepSeek offers those schemas to its model whole (request-shape.ts). So output-schema.ts is UNCHANGED.
- Changed runtime/models/providers/anthropic/schema.ts: new `isOpenOptionalObject`; an optional property that is exactly
  `{type:"object"}` is left out of the Anthropic grammar only and not counted as optional. Root `{type:"object"}` still falls back to JSON text.
- Result: loop_verification and runtime_diagnosis schemas give `jsonText:false`, every object closed, no `metadata` property.

## Item 2: key-up repair
- New runtime/models/providers/anthropic/reply/key-up.ts (`automationStudioAnthropicReplyKeyUp`), exported from reply/index.ts.
- Wired in runtime/llm/anthropic/task-answer.ts (the caller of own-word; outside the owned list, wiring only) after the own-word repair.
- runtime/llm/harness/provider-result.ts: `diagnosisWithConfidenceUp` applied at the top of the structured-response parse.
  `confidence` in both places stays refused (unexpected_field).

## Item 3: unusable-decision.ts
- `accepted` is now `{ reply: { kind: "evidence_tool_decision", summary: "<one short line ...>", decision: { oneOf: [shapes] } }, rule }`.
- New rule words: "Answer with exactly one object of the reply shape and no other keys. Its outer kind is always "evidence_tool_decision", and the decision goes in its decision key, as one of the listed shapes."
- Updated pins: evidence-loop/tests/stalled-amendments-replay.test.ts, tests/unusable-decision.test.ts.

## judge.ts
- Dropped "once" from `checkedWhat` text; updated tests/judge.test.ts (2 lines).

## Tests added (llm/anthropic/tests)
- native-judge-schema.test.ts (native schema, closed objects, metadata still in the original, identical output_config and system across steps for judge and decide, 0034 moved up, both-places refused, long observed, harness moves/refuses), key-up-nested-kind.test.ts (0067 shape).
- provider.test.ts: the malformed-transport case now uses decisionRequest() (a JSON-text request), since diagnosis is native now.

## Commands
- `npx vitest run --maxWorkers 2 --minWorkers 1 ...` (the config sets min threads, so --maxWorkers alone errors with "minThreads and maxThreads must not conflict"): llm/tests, result-verification/flow-less, models/providers/anthropic, llm/harness, llm/deepseek, llm/evidence-loop -> 126 files, 1474 tests passed; after the last edit llm/harness, llm/anthropic, llm/tests -> 88 files, 1014 passed.
- `pnpm.cmd --filter fluxiq check` -> first runs failed (TS narrowing in provider-result.ts, fixed), final run stored/passed.
- `node scripts/structure-audit.mjs` -> passed (first run flagged an `as never` in my test, removed).
- Build of contracts, fluxiq, client-gateway-websocket, ui-components -> all Done.

## Not verified
- No provider call: Anthropic compiling the native judge grammar is unproven. Step B not done.
- Whole-package vitest not run.
