// What a trial's judge is sent of its change (t775): the request a build
// test's judge makes, read from the body the DeepSeek adapter puts on the
// wire for it, carries the summary's siteChange and the words that say how
// to judge each part by it (`../../../llm/diagnosis-instructions.ts`). No model is
// called: the transport is scripted and only captures.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
// After the judge: the adapter's barrel loaded first reaches the judge's modules through a cycle before they are evaluated.
import { createAutomationStudioDeepSeekProvider } from "../../../llm/deepseek/index.ts";
import { LIBRARY_HOLDS_REQUEST, libraryHoldsChange, libraryHoldsSummary } from "./library-holds-fixture.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: LIBRARY_HOLDS_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The judge's verdict, and each request it made: a scripted provider that answers yes and only captures. */
async function judgedWith(siteChange = libraryHoldsChange("already_in_end_state")): Promise<{ seen: AutomationStudioLlmTaskRequest[]; verdict: Awaited<ReturnType<ReturnType<typeof automationStudioBuildTestJudge>>> }> {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      seen.push(request);
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes", observed: "The holds list shows the new hold; the alert is set to email." } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
    }
  };
  const judge = automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
  const verdict = await judge({ summary: { ...libraryHoldsSummary(siteChange), startedWith: ["already done by this build (act-1): press Place hold"] }, budget: { maxCostUsd: 1 } });
  return { seen, verdict };
}

/** The messages one request would put on the wire, read from the DeepSeek adapter's outbound body itself. */
async function onTheWire(request: AutomationStudioLlmTaskRequest): Promise<Array<{ role: string; content: string }>> {
  let outbound = "";
  const provider = createAutomationStudioDeepSeekProvider({
    now: () => Date.UTC(2026, 8, 30, 2),
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (input) => {
      outbound = input.outboundBody;
      return "test-secret";
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", diagnosis: { answersRequest: "yes" }, summary: "Judged." }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  await provider.runTask(request);
  return (JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> }).messages;
}

describe("the judge of a trial is sent its change and told how to read it", () => {
  it("renders siteChange in the request and the change words in the system message", async () => {
    const { seen } = await judgedWith();
    expect(seen).toHaveLength(2);
    const messages = await onTheWire(seen[0]!);
    const system = messages.find((message) => message.role === "system");
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toContain('"siteChange":{"witnesses":[{"id":"w1","kind":"list","where":"My holds"');
    expect(user?.content).toContain('"proof":"already_in_end_state"');
    expect(user?.content).toContain('"outcome":"already_in_state"');
    expect(system?.content).toContain("resultSummary.siteChange, where present, is what Core read of the site just before this run and just after it");
    expect(system?.content).toContain("Judge each part with an effect by the change between before and after, never by the state after alone.");
    expect(system?.content).toContain("An act listed already_in_state did not act");
    expect(system?.content).toContain("is met when before equals after, even where its state is not what the task would want");
  });

  it("answers unknown, never yes, when both calls said yes over an end state that already held", async () => {
    const { verdict } = await judgedWith();
    expect(verdict.verdict).toBe("unknown");
    expect(verdict.verdict === "unknown" ? verdict.why : "").toContain('part "p2" (already_in_end_state');
    expect((await judgedWith(libraryHoldsChange("carried"))).verdict.verdict).toBe("yes");
  });
});
