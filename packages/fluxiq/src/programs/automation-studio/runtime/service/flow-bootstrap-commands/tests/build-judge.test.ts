// What a build's judge is told beside its test (t195-w28a): what the completion
// check found the accepted Flow cannot do, and each observation without the
// domain's view. The completion check is the real one; the provider is scripted
// and only captures what it would have been sent.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion, type AutomationStudioFlowDraftTestReport, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowBootstrapBuildJudge } from "../build-judge.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const ASKS_FOR_A_TABLE = "Scrape every product the search returns as a table with columns name and price.";
const DENIED = ["html", "selector"];

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: ASKS_FOR_A_TABLE,
  scope: { kind: "flow", projectId: "project.1", flowId: "flow.1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** A Flow that reads one value where the instruction asks for a table. */
const readsOneValue: JsonObject = {
  schemaVersion: "0.1",
  router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
  subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract", definitionVersion: "1.0.0", outputActionId: "web.dom.extract", parameters: { selector: ".price" } }], edges: [] }]
};
const read: AutomationStudioFlowDraftStep = {
  position: 1, id: "d1", iteration: 1, actionId: "web.output.dom-extract", toolId: "core.run_node",
  input: { node: "web.output.dom-extract", parameters: { field: "price" } }, effect: "observe", proposes: true, disposition: "kept"
};

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", observed: "No step reads a table." } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
      }
    }
  };
}

describe("a build's judge", () => {
  it("is told what the completion check found an accepted Flow cannot do, and reads each observation without its view", async () => {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the price", plan: readsOneValue }, projectId: "project.1", flowId: "flow.1", registry, resolution, instructionText: ASKS_FOR_A_TABLE
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => verdict.buildPlan.plan, notes: () => verdict.notes, observedStateKeys: ["page"]
    });
    judge.roundStarted();
    judge.observeTest({
      verdict: { attempt: 1, reset: "ok", outcomes: [{ step: 1, stepId: "d1", actionId: read.actionId, status: "replayed" }], providerCalls: 0, ok: true },
      observations: [{ step: 1, stepId: "d1", evidence: { ok: true, page: "PAGE \"Shop\"\nt1 heading \"Products\"", read: { value: "$4.99" } } }],
      reused: false
    } satisfies AutomationStudioFlowDraftTestReport);

    const judged = await judge.judge({ round: 1, loop: { ok: true, result: { summary: "Read the price" }, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);

    expect(judged).toMatchObject({ verdict: "no", observed: "No step reads a table." });
    const buildTest = seen[0]?.context.resultSummary?.buildTest;
    expect(buildTest?.notes).toEqual([{
      code: "bootstrap.cannot_answer_instruction",
      said: "The instruction asks for a set of records and no step of this Flow produces or saves one, so no run of it could answer.",
      columns: ["name", "price"]
    }]);
    expect(buildTest?.steps[0]?.observed).toEqual({ ok: true, read: { value: "$4.99" } });
  });

  it("is told nothing beside the test when the check found nothing", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined, notes: () => undefined
    });
    await judge.judge({ round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never);
    expect(seen[0]?.context.resultSummary?.buildTest).not.toHaveProperty("notes");
  });

  // The judge's provider calls are calls outside the loop: the build counts them
  // with the authority's (`additionalProviderCallCount`), so the count agrees with
  // the accounting, which has their spend (t195-w28b's finding).
  it("counts every provider call its judgements made, across rounds", async () => {
    const { provider, seen } = scripted();
    const judge = automationStudioFlowBootstrapBuildJudge({
      provider, instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: "project.1", flowId: "flow.1",
      instructionText: ASKS_FOR_A_TABLE, plan: () => undefined
    });
    expect(judge.calls()).toBe(0);
    const round = { round: 1, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 1 } } as never;
    // A no is asked twice (`result-verification/verify.ts`).
    await judge.judge(round);
    expect(judge.calls()).toBe(2);
    await judge.judge(round);
    expect(judge.calls()).toBe(4);
    expect(judge.calls()).toBe(seen.length);
    // No cost left: nobody is asked, and nothing is counted.
    await judge.judge({ round: 2, loop: { ok: true, result: {}, trace: [], steps: [read], accounting: {} }, budget: { maxCostUsd: 0 } } as never);
    expect(judge.calls()).toBe(4);
  });
});
