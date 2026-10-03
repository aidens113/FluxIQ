// A runtime bound with its own system instructions: every provider request the
// build makes carries them -- each evidence decision and the judge of the
// Flow's test, each measured as well as sent -- and the DeepSeek adapter's
// measure of each counts the text. Where the adapter puts it is pinned in
// `llm/deepseek/tests/system-prompt.test.ts`. The chat is told them too, and a
// text Core would refuse fails when the runtime is bound.
//
// Through the real `generateFlowBootstrapAdaptation`, with a scripted provider
// and a stand-in domain; no model is called.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioConversationModelRequest } from "../../../conversations/index.ts";
import { estimateAutomationStudioDeepSeekInputTokens, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, isJudgeRequest, judgeReply, mockProvider, plan } from "./fixtures.ts";

const INSTRUCTIONS = { version: "example.v1", text: "Rows on a shelf are read with shop.read.\nA control is pressed by its visible name." };
const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-domain-instructions-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function shop(systemInstructions?: unknown): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    ...(systemInstructions === undefined ? {} : { systemInstructions: systemInstructions as never }),
    tools: [
      { toolId: "shop.look", description: "Look at the page in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: "shop.read", description: "Read the rows of the list in view.", inputSchema: { type: "object" }, effect: "observe" }
    ],
    executeTool: async ({ toolId, value }) => {
      if (typeof value.replay === "string") {
        if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { page: "shop/home" }, effectApplied: true, resultCode: "core.replay.replayed" };
        return { kind: "llm_evidence_tool_execution", evidence: { rows: [{ name: "Towels" }] }, effectApplied: true, resultCode: "core.replay.replayed" };
      }
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page: "shop/home" }, effectApplied: false };
      const ranWith: JsonObject = { list: String(value.list ?? "shelf") };
      return { kind: "llm_evidence_tool_execution", evidence: { rows: [{ name: "Towels" }] }, effectApplied: true, draft: { effect: "observe", proposes: true, ranWith, replay: { from: { location: "shop/home" } } } };
    }
  };
}

/** A provider that answers a read, a completion and the judge's yes, and records every request it was asked to run or measure. */
function scriptedProvider(): { provider: AutomationStudioLlmProvider; ran: AutomationStudioLlmTaskRequest[]; measured: AutomationStudioLlmTaskRequest[] } {
  const ran: AutomationStudioLlmTaskRequest[] = [];
  const measured: AutomationStudioLlmTaskRequest[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.read", toolId: "shop.read", input: { list: "shelf" }, add: true },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  const provider = mockProvider(async (request) => {
    ran.push(request);
    if (isJudgeRequest(request)) return judgeReply("yes");
    const decision = decisions.shift();
    if (!decision) throw new Error("The script has no further decision.");
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: USAGE };
  });
  provider.measureInput = (request) => {
    measured.push(request);
    return { estimatedInputTokens: 1_000, estimatedInputBytes: 3_000 };
  };
  return { provider, ran, measured };
}

describe("a runtime bound with its own system instructions", () => {
  it("sends them on every provider request of a build, decisions and judge alike, and the adapter counts them", async () => {
    const { provider, ran, measured } = scriptedProvider();
    const instance = new AutomationStudioService({ dataDir: tempRoot, llmProviderResolver: (() => ({ provider, maxCallsPerRun: 24, maxEstimatedCostUsd: 0.25 })) as never });
    services.add(instance);
    // Bound after the resolver, as a host binds it: the provider is resolved per build, so it is this binding that is stamped.
    instance.bindLlmEvidenceRuntime(shop(INSTRUCTIONS));
    const { project, flow } = await blankFixture(instance, "active", "example");

    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });

    expect(result.status).toBe("proposed");
    // Two decisions and the judge, its yes confirmed by a second call (murwcmx2, C-H): two different call sites, one provider.
    expect(ran.map(isJudgeRequest)).toEqual([false, false, true, true]);
    const expected = { domainId: "example", ...INSTRUCTIONS };
    for (const request of ran) expect(request.domainInstructions).toEqual(expected);
    expect(measured.length).toBeGreaterThan(0);
    for (const request of measured) expect(request.domainInstructions).toEqual(expected);
    for (const request of ran) {
      // What the adapter sends for the request, measured with and without the instructions it carries.
      const { domainInstructions: _carried, ...without } = request;
      expect(estimateAutomationStudioDeepSeekInputTokens(request)).toBeGreaterThan(estimateAutomationStudioDeepSeekInputTokens(without));
    }
  }, 60_000);

  it("sends nothing of the kind when the runtime binds none", async () => {
    const { provider, ran } = scriptedProvider();
    const instance = new AutomationStudioService({ dataDir: tempRoot, llmProviderResolver: (() => ({ provider, maxCallsPerRun: 24, maxEstimatedCostUsd: 0.25 })) as never, llmEvidenceRuntime: shop() });
    services.add(instance);
    const { project, flow } = await blankFixture(instance, "active", "example");

    await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });

    expect(ran.length).toBeGreaterThan(0);
    for (const request of ran) expect(request.domainInstructions).toBeUndefined();
  }, 60_000);

  it("tells the chat's model them as well", async () => {
    const instance = new AutomationStudioService({ dataDir: tempRoot, llmEvidenceRuntime: shop(INSTRUCTIONS) });
    services.add(instance);
    const project = await instance.createProject({ name: "Chat", domainId: "example" });
    const seen: AutomationStudioConversationModelRequest[] = [];
    instance.conversations.bindModel({ name: "capturing", decide: async (request) => { seen.push(request); return { reply: "Hello." }; } });
    const opened = await instance.conversations.openConversation({ projectId: project.id, subject: { kind: "project", id: project.id }, title: null });

    await instance.conversations.respondToPersonTurn({
      projectId: project.id,
      conversationId: opened.conversationId,
      text: "Hello.",
      actorId: "user.aiden",
      capabilities: parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run it"], consequences: [], arguments: [] }]),
      flows: [],
      onScreen: {},
      limits: { attempts: 1, attemptTimeoutMs: 1_000, deadlineMs: 2_000, backoffMs: 1 }
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.instructions).toContain(`\n\n${INSTRUCTIONS.text}\n\n`);
  }, 30_000);

  it("refuses a text Core would refuse when the runtime is bound, not mid-build", () => {
    expect(() => new AutomationStudioService({ llmEvidenceRuntime: shop({ version: "example.v1", text: "Rules.\tTabbed." }) })).toThrow(/domain "example" system instructions example\.v1: text contains a control character/u);
    const instance = new AutomationStudioService({});
    services.add(instance);
    expect(() => instance.bindLlmEvidenceRuntime(shop({ version: "Example V1", text: "Rules." }))).toThrow(/version must match/u);
    expect(() => instance.bindLlmEvidenceRuntime(shop({ version: "example.v1", text: "x".repeat(4_001) }))).toThrow(/over the 4000-character limit/u);
  });
});
