import { describe, expect, it } from "vitest";
import { createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput } from "../index.ts";
import type { AutomationStudioLlmTaskRequest } from "../task-request.ts";

// D1 of `run-mv6bg8sv-99895ba1` (t492). Each trial's first judge call and the
// Flow run's result check were cached only through the system prompt: the
// user message carried the run's id in front of the instructions, so two
// judges of one build parted at character 1,128 and everything after it --
// instructions, policy -- was billed again. A judge is a one-shot call, so
// its cache is only ever another judge's prefix: what is the same for every
// judge of one build has to come before anything that is not.
//
// B3 and W3 of round 15 (t495): with the run id after the policy, each
// trial's first judge still parted at the run id, which sat in front of the
// result summary, and so in front of its start view -- the page every trial
// of one build starts from, about 1k tokens of the same bytes. Everything
// that varies per trial now follows the start view.

const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1",
  instructionId: "instruction.goal",
  title: "Goal",
  body: "Collect every listed garden tool under twenty dollars into a table with its name and price.",
  scope: { kind: "flow", projectId: "project.ef1c0f3e-b8874", flowId: "flow.6b2f1a90-3c1d-4a51-a585-b0926b1ef6b7" },
  priority: 1,
  status: "active",
  requirement: "required",
  createdAt: 1,
  updatedAt: 1
};

const POLICY = {
  preset: "balanced",
  allowRuntimeRecovery: true,
  allowCreateRecoveryPaths: true,
  allowModifySubflows: true,
  allowCreateSubflows: false,
  allowModifyRouter: false,
  allowModifyExpectations: true,
  allowModifyActionTargets: true,
  allowDeleteOrDisableBehavior: false,
  requireApprovalForDestructiveChanges: true,
  allowExternalSideEffects: false,
  requireApprovalForExternalSideEffects: true
} as unknown as NonNullable<AutomationStudioLlmHarnessInput["policy"]>;

const STABLE_KEYS = ['"taskKind"', '"outputSchema"', '"context"', '"projectId"', '"flowId"', '"instructions"', '"policyGates"', '"resultSummary"', '"startView"'];

describe("the bytes two judges of one build share", () => {
  it("keeps everything a trial judge has in common with the next one, the start view included, in front of the trial's own run id and result", async () => {
    const first = await userMessage(judge({ runId: "build-test.27ed1565-c9a5-499b-9e01-a4fd11581582", rows: 2, subflowId: "subflow.trial-1", nodeId: "node.read-1" }));
    const second = await userMessage(judge({ runId: "build-test.034dea80-dc3e-4e8d-a4f1-da57e842d71c", rows: 1, subflowId: "subflow.trial-2", nodeId: "node.read-2" }));
    expectStableHead(first, second, STABLE_KEYS);
  });

  it("does the same for the result check of two runs of one Flow", async () => {
    const first = await userMessage(judge({ runId: "424050ec-0507-4852-a3ca-9fa1bde88901", rows: 4, subflowId: "subflow.main", actions: 3 }));
    const second = await userMessage(judge({ runId: "9b1f0c2e-77aa-4e0d-9a51-2c6c0d1e3f40", rows: 3, subflowId: "subflow.main", actions: 5 }));
    expectStableHead(first, second, STABLE_KEYS);
  });

  it("still carries the run id, the part, the node and the actions, after the policy and the result summary", async () => {
    const message = await userMessage(judge({ runId: "run.one", rows: 1, subflowId: "subflow.main", nodeId: "node.read", actions: 1 }));
    const context = (JSON.parse(message) as { context: Record<string, unknown> }).context;
    expect(context).toMatchObject({ runId: "run.one", subflowId: "subflow.main", nodeId: "node.read" });
    const keys = Object.keys(context);
    for (const id of ["runId", "subflowId", "nodeId", "recentActions"]) {
      expect(keys.indexOf(id), id).toBeGreaterThan(keys.indexOf("policyGates"));
      expect(keys.indexOf(id), id).toBeGreaterThan(keys.indexOf("resultSummary"));
    }
  });
});

/** The two messages agree through the last stable key's value, and part no earlier than where the first per-call value begins. */
function expectStableHead(first: string, second: string, stableKeys: readonly string[]): void {
  const shared = commonPrefixLength(first, second);
  const offsets = stableKeys.map((key) => {
    const at = first.indexOf(key);
    expect(at, key).toBeGreaterThan(-1);
    expect(at, key).toBeLessThan(shared);
    return at;
  });
  expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
  // The start view is the last stable part, and it is whole inside the shared prefix.
  const context = (JSON.parse(first) as { context: { resultSummary: { startView: unknown } } }).context;
  const startViewEnd = first.indexOf('"startView":') + '"startView":'.length + JSON.stringify(context.resultSummary.startView).length;
  expect(shared).toBeGreaterThanOrEqual(startViewEnd);
  // And nothing that names this call, or counts what it found, comes before it.
  for (const key of ['"runId":', '"subflowId":', '"nodeId":', '"recentActions":', '"totalRecordCount":']) {
    const at = first.indexOf(key);
    if (at > -1) expect(at, key).toBeGreaterThan(startViewEnd);
  }
}

/** The page each trial of one build starts from: the same bytes in every trial's summary. */
const START_VIEW = {
  after: 0,
  view: {
    url: "https://tools.example/garden",
    title: "Garden tools",
    text: Array.from({ length: 40 }, (_, index) => `Hand trowel model ${index + 1} at ${(9 + index / 4).toFixed(2)} dollars, add to basket`).join("\n")
  }
};

function judge(input: { runId: string; rows: number; subflowId?: string; nodeId?: string; actions?: number }): AutomationStudioLlmTaskRequest {
  const harness: AutomationStudioLlmHarnessInput = {
    taskKind: "loop_verification",
    projectId: "project.ef1c0f3e-b8874",
    flowId: "flow.6b2f1a90-3c1d-4a51-a585-b0926b1ef6b7",
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    instructions: [INSTRUCTION],
    deniedEvidenceKeys: [],
    policy: POLICY,
    ...(input.actions ? { runDetail: runDetail(input.runId, input.actions) } : {}),
    resultSummary: {
      schemaVersion: "automation-studio.run-result-summary.v1",
      startView: START_VIEW,
      totalRecordCount: input.rows,
      totalRefusedCount: 0,
      totalRowsMissingRequired: 0,
      recordSetCount: 1,
      recordSets: [],
      flowShape: []
    } as unknown as NonNullable<AutomationStudioLlmHarnessInput["resultSummary"]>,
    metadata: { source: "verifyAutomationStudioRunResult", expectedOutput: "diagnosis" }
  };
  const context = packAutomationStudioLlmContext(harness);
  return {
    requestId: `request.judge.${input.runId}`,
    idempotencyKey: `request.judge.${input.runId}`,
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "loop_verification",
    promptVersion: context.promptVersion,
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 4_000, maxTotalTokens: 52_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [],
    context
  };
}

function runDetail(runId: string, count: number): AutomationStudioFlowRunDetail {
  const actionAttempts = Array.from({ length: count }, (_, index): AutomationStudioFlowRunActionAttemptRecord => ({
    attemptId: `${runId}.attempt.${index + 1}`,
    nodeId: `node.${index + 1}`,
    definitionId: "web.dom.click",
    order: index + 1,
    status: "succeeded"
  } as unknown as AutomationStudioFlowRunActionAttemptRecord));
  return { actionAttempts } as unknown as AutomationStudioFlowRunDetail;
}

/** The user message the DeepSeek adapter sends for a request, read off the outbound body. */
async function userMessage(request: AutomationStudioLlmTaskRequest): Promise<string> {
  let outbound = "";
  const provider = createAutomationStudioDeepSeekProvider({
    now: () => Date.UTC(2026, 8, 30, 2),
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (secret) => {
      outbound = secret.outboundBody;
      return "test-secret";
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "Done.", confidence: 0.9 }) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  // Only the body sent matters here; how the reply reads is another test's subject.
  await provider.runTask(request).catch(() => undefined);
  expect(outbound, "the adapter sent nothing").not.toBe("");
  const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
  return body.messages.find((message) => message.role === "user")!.content;
}

function commonPrefixLength(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left.charAt(index) === right.charAt(index)) index += 1;
  return index;
}
