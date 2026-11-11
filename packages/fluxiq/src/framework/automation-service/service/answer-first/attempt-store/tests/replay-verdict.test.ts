// A kept replay verdict is read as strictly as the rest of a stored row (t897, `../replay-verdict.ts`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS } from "../../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstReplayVerdictRead } from "../index.ts";

describe("a kept replay verdict", () => {
  it("reads back every deviation the contract names, and nothing else", () => {
    for (const deviation of AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS) expect(automationStudioAnswerFirstReplayVerdictRead({ stood: false, deviation })).toEqual({ stood: false, deviation });
    expect(automationStudioAnswerFirstReplayVerdictRead({ stood: true })).toEqual({ stood: true });
    for (const bad of [null, [], "stood", { stood: true, deviation: "step_routed" }, { stood: false }, { stood: false, deviation: "page said so" }, { stood: false, deviation: "step_routed", extra: 1 }]) {
      expect(automationStudioAnswerFirstReplayVerdictRead(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});
