# Downstream target-preparation test contracts

Outcome: Done; all three Down test files saved and frozen. No readers active.

Root's normal guarded downstream check reported eleven errors in the three named new subjects; this worker changed only `domain/src/output-nodes/target-preparation/tests/{bundle,prepare,legacy-policy}.test.ts`.

- `bundle.test.ts` and `prepare.test.ts`: actual click fixtures now supply `actionType: "web.dom.click"`, matching their registered output. Each selected-candidate assertion first asserts the real resolution discriminator equals `"matched"`, which narrows the union before reading `candidateId`/`minimumConfidence`.
- `legacy-policy.test.ts`: assert the actual failure and its expected/actual strings exist, then retain the original `99%` inclusion and exact confidence regex assertions.
- All original candidate IDs, thresholds, drawing values, receiver/tuple/error identity checks, pure-contract negatives, missing-hook expectations, privacy/trace oracles and deliberate failure cases remain asserted. No cast, empty-value fallback, production implementation, Core export or normalizer changed.

Initial validation was held during Root's Core public-export rebuild; the missing `runtimeSessionToFlowRunDetail` export was a separate Root-owned real public seam. After Root confirmed current built Core, the actual guarded legacy-policy reader exposed the unreferenced default retry-timer fixture issue documented in [downstream-legacy-policy-pending.md](downstream-legacy-policy-pending.md). Root approved an explicit test delay; corrected normal guarded legacy-policy subject passed6/6 with all original oracles, current Core guard and no overlays. Bundle/prepare normal acceptance and package type checks remain Root-owned; no worker claim based only on source inspection.

Pending exact subjects:
`domain/src/output-nodes/target-preparation/tests/bundle.test.ts`
`domain/src/output-nodes/target-preparation/tests/prepare.test.ts`
`domain/src/output-nodes/target-preparation/tests/legacy-policy.test.ts`

No other source/test file, config, baseline, shared document or git state changed. Reports only after freeze.
