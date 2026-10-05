import { expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../index.ts";

const request = { projectedCostUsd: 0.001, estimatedInputTokens: 100, maxOutputTokens: 50 };

it("holds the last logical call against concurrent sends and releases an unsent request", () => {
  const options = { ceilingUsd: 0.1, maxCalls: 1 };
  const purse = new AutomationStudioLlmBuildPurse(options);
  const first = purse.hold(request);
  expect(first.ok).toBe(true);
  expect(purse.hold(request)).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", maxCalls: 1, pendingCalls: 1, spentCalls: 0 } });
  if (first.ok) first.hold.release();
  const replacement = purse.hold(request);
  expect(replacement.ok).toBe(true);
  if (replacement.ok) { replacement.hold.settle(); replacement.hold.settle(); replacement.hold.release(); }
  expect(purse.hold(request)).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", spentCalls: 1, pendingCalls: 0 } });
});

it("leaves the configured judge pair available across exploration and repair", () => {
  const options = { ceilingUsd: 0.1, maxCalls: 4 };
  const purse = new AutomationStudioLlmBuildPurse(options);
  purse.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 100, outputTokens: 50 } });
  for (let index = 0; index < 2; index += 1) {
    const held = purse.hold(request);
    expect(held.ok).toBe(true);
    if (held.ok) held.hold.settle();
  }
  expect(purse.hold(request)).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", keptBackCalls: 2 } });
  for (let index = 0; index < 2; index += 1) {
    const held = purse.hold({ ...request, judge: true });
    expect(held.ok).toBe(true);
    if (held.ok) held.hold.settle();
  }
  expect(purse.hold({ ...request, judge: true }).ok).toBe(false);
});
