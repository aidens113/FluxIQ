// The build-test judge's yes says whether it was first-ask confirmed (t677),
// as the verification recorded it, where its call count cannot: a first call
// that timed out and was asked again adds a call to a genuinely confirmed yes,
// and two refuted nos asked again make a yes of four calls that is not. No
// model is called; the provider is scripted. A lamp shop, not a Lab scenario.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { LAMP_SHADE, LAMPS_INSTRUCTION, SAME_LAMP_NO, lampsRunSummary } from "../../refuted-no/tests/lamps-fixture.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", ...SAME_LAMP_NO, defects: [] };
const YES = {
  answersRequest: "yes",
  expected: SAME_LAMP_NO.expected,
  observed: `Condition 1 (sponsored is absent) follows "Leave out sponsored listings". Condition 2 (rating atLeast 4) follows "rated 4 or higher". "${LAMP_SHADE}" is left out as "spare parts such as spare bulbs or lamp shades" says.`
};

/** A provider answering each call in turn; `"timeout"` throws the provider's timeout. */
function answering(...calls: Array<Record<string, unknown> | "timeout">): AutomationStudioLlmProvider {
  let at = 0;
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => {
      const call = calls[at++] ?? {};
      if (call === "timeout") throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call }, usage: USAGE };
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [LAMPS_INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider })({ summary: lampsRunSummary(), budget: { maxCostUsd: 0.2 } });

describe("the build-test judge's yes, by how it was reached", () => {
  it("is first-ask confirmed for two first-ask yeses", async () => {
    expect(await judge(answering(YES, YES))).toMatchObject({ verdict: "yes", firstAskConfirmed: true, spent: { calls: 2 } });
  });

  it("is first-ask confirmed though a timed-out first call was asked again: three calls, the same confirmed yes", async () => {
    expect(await judge(answering("timeout", YES, YES))).toMatchObject({ verdict: "yes", firstAskConfirmed: true, spent: { calls: 3 } });
  });

  it("is not first-ask confirmed where two refuted nos were asked again into yeses", async () => {
    expect(await judge(answering(NO, NO, YES, YES))).toMatchObject({ verdict: "yes", firstAskConfirmed: false, spent: { calls: 4 } });
  });
});
