// A judge's no keeps, in Core's record of it, only the defects Core finds in its
// own record of the result (framework plan P5b, `../record.ts`): the kind and
// row as Core located them, never the judge's prose, and never a defect Core
// cannot find. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import { campsiteInstruction } from "../../refuted-no/tests/campsite-fixture.ts";
import { CABIN_KEPT_NO, CAMP_CABIN, cabinKeptSummary } from "./campsite-swing-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NOT_IN_RESULT = "Lakeside Glamping Pods";

function answering(diagnosis: Record<string, unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE })
  };
}

const judged = (defects: Array<Record<string, string>>) => automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1",
  provider: answering({ answersRequest: "no", ...CABIN_KEPT_NO, defects }) })({ summary: cabinKeptSummary(), budget: { maxCostUsd: 0.2 } });

describe("the defects a judge's no keeps in Core's record (P5b)", () => {
  it("keeps the defect Core finds, as kind and row, and drops one Core cannot find", async () => {
    const verdict = await judged([
      { kind: "kept_not_asked", row: CAMP_CABIN.name, requestWords: "every campsite" },
      { kind: "kept_not_asked", row: NOT_IN_RESULT, requestWords: "every campsite" }
    ]);
    const record = "standingNo" in verdict ? verdict.standingNo : undefined;
    expect(record?.located).toEqual([{ kind: "kept_not_asked", row: CAMP_CABIN.name }]);
    expect(record).not.toHaveProperty("source");
    expect(JSON.stringify(record)).not.toContain(NOT_IN_RESULT);
  });

  it("keeps none where the no names no defect Core can find", async () => {
    const verdict = await judged([{ kind: "kept_not_asked", row: NOT_IN_RESULT, requestWords: "every campsite" }]);
    const record = "standingNo" in verdict ? verdict.standingNo : undefined;
    expect(record).toBeDefined();
    expect(record).not.toHaveProperty("located");
  });
});
