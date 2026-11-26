// Unreadable replies never escalate a judge, and a continuing judge's re-ask stays on its model: in its conversation
// after a decider sent as tools, on its own request after a JSON-text decider, the adapter deciding which (t1065).
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmModelLadder, automationStudioLlmProviderRoutedByRole, automationStudioLlmRoleRoutedResolution, runWithAutomationStudioLlmModelLadder } from "../index.ts";
import { createAutomationStudioAnthropicProvider } from "../../anthropic/index.ts";
import { decisionCall, decisionRequest, request, streamReply, toolUseStreamReply } from "../../anthropic/tests/fixtures.ts";

const judge = (metadata: Record<string, unknown> = {}) => ({ requestId: "r", taskKind: "loop_verification", context: {}, metadata }) as unknown as AutomationStudioLlmTaskRequest;
const decision = { requestId: "r", taskKind: "evidence_tool_decision", context: {} } as unknown as AutomationStudioLlmTaskRequest;

/** A host resolver on a Claude key: a provider bound to the model asked for. */
async function resolver(input: AutomationStudioLlmProviderResolverInput): Promise<AutomationStudioLlmProviderResolution> {
  const model = input.modelId ?? "claude-haiku-5-5";
  return { provider: { metadata: { provider: "anthropic", model }, runTask: async () => ({ model }) } as unknown as AutomationStudioLlmProvider };
}

describe("a judge retrying on the same model", () => {
  it("ignores obsolete judge climb metadata and keeps the starting model", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const served = (request: AutomationStudioLlmTaskRequest) => (resolution?.provider.servedBy?.(request) ?? resolution?.provider)?.metadata.model;
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => [
      served(judge()), served(judge({ judgeRungsUp: 1 })), served(judge({ judgeRungsUp: 2 })), served(judge({ judgeRungsUp: 5 })),
      // A value that is not a whole number of rungs climbs nothing.
      served(judge({ judgeRungsUp: -1 })), served(judge({ judgeRungsUp: "1" })),
      served(decision), served(judge())
    ]);
    expect(seen).toEqual(Array(8).fill("claude-haiku-5-5"));
    expect(attempt.level).toBe(0);
  });

  it("keeps a continuing judge's re-ask after an unreadable reply on the decider's model", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const served = (request: AutomationStudioLlmTaskRequest) => (resolution?.provider.servedBy?.(request) ?? resolution?.provider)?.metadata.model;
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      served(decision);
      attempt.escalate({ reason: "loop_persisted" });
      return [served(judge({ continuesDecider: true })), served(judge({ continuesDecider: true, judgeAnswersInConversation: true })), served(judge({ continuesDecider: true, judgeAnswersInConversation: true, judgeRungsUp: 1 })), served(judge())];
    });
    // A legacy escalation climbs nothing: the first ask, every re-ask and a judge of its own all stay on the base model.
    expect(seen).toEqual(Array(4).fill("claude-haiku-5-5"));
  });

  it("uses its own provider without a ladder", () => {
    const explore = { metadata: { provider: "mock", model: "explore" }, runTask: async () => ({}) } as unknown as AutomationStudioLlmProvider;
    const own = { metadata: { provider: "mock", model: "judge" }, runTask: async () => ({}) } as unknown as AutomationStudioLlmProvider;
    const routed = automationStudioLlmProviderRoutedByRole({ explore, judge: own });
    expect(routed.servedBy?.(judge({ judgeRungsUp: 1 })).metadata.model).toBe("explore");
    expect(routed.servedBy?.(judge({ continuesDecider: true, judgeAnswersInConversation: true })).metadata.model).toBe("explore");
  });

  // t1065: which way a continuing judge's re-ask goes is the adapter's to decide, by the decider's transport: in the
  // judge's own conversation after a decider sent as tools, on its own request after a JSON-text decider (t979). Either
  // way routing serves it the decider's model. The real Anthropic adapter over a scripted fetch; no model is called.
  it.each([
    ["sent as tools", true, 4],
    ["in the JSON-text transport", false, 1]
  ])("serves the re-ask after a decider %s on the decider's model, the adapter choosing its shape", async (_transport, decisionTools, reaskMessages) => {
    const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
    const VERDICT = { kind: "diagnosis", diagnosis: { answersRequest: "yes", defects: [], checked: [{ row: "Emma", column: "title", value: "Emma" }], answerRecords: { asked: true, siteShows: 1 } }, summary: "The book on the shelf is listed." };
    const replies = decisionTools
      ? [() => toolUseStreamReply([decisionCall(DECISION)]), () => streamReply("The shelf lists the book, so the result holds it."), () => toolUseStreamReply([{ name: "core_check_answer", input: VERDICT }])]
      : [() => streamReply(JSON.stringify({ result_json: JSON.stringify(DECISION) })), () => streamReply(`{"result_json": "{\\"kind\\":\\"diagnosis\\",\\"diagnosis\\":{\\"answersRequest`), () => streamReply(JSON.stringify(VERDICT))];
    const sent: Array<{ model: string; messages: unknown[]; output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } } }> = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)) as (typeof sent)[number]);
      return replies[sent.length - 1]!();
    };
    const resolution = await automationStudioLlmRoleRoutedResolution(async (input) => ({
      provider: createAutomationStudioAnthropicProvider({ model: input.modelId ?? "claude-haiku-5-5", secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", decisionTools, fetchImpl: fetchImpl as unknown as typeof fetch })
    }), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const provider = resolution!.provider;
    const decider = decisionRequest();
    decider.deniedEvidenceKeys = [];
    decider.context.evidenceLoop!.evidence = [{ callId: "call.1", toolId: "core.run_node", value: { ok: true, page: "Shelf 1: Emma, Persuasion." } }];
    const asked = (metadata: Record<string, unknown>) => {
      const base = request({ taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v3", expectedOutput: "diagnosis", deniedEvidenceKeys: [], metadata: { source: "test", ...metadata } });
      const resultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", question: "Was it got?", trail: { note: "how to read it", entries: [{ n: 1, callId: "call.1", did: "core.run_node", outcome: "answered" }] }, totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "result", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Emma" }] }], flowShape: [], withheld: false };
      return { ...base, context: { ...base.context, taskKind: "loop_verification", promptVersion: base.promptVersion, resultSummary } } as unknown as AutomationStudioLlmTaskRequest;
    };
    const answer = await runWithAutomationStudioLlmModelLadder(automationStudioLlmModelLadder(), async () => {
      await provider.runTask(decider);
      const first = await provider.runTask(asked({ continuesDecider: true })).then(() => "read", () => "unreadable");
      expect(first).toBe("unreadable");
      expect((provider.servedBy?.(asked({ continuesDecider: true, judgeAnswersInConversation: true })) ?? provider).metadata.model).toBe("claude-haiku-5-5");
      return await provider.runTask(asked({ continuesDecider: true, judgeAnswersInConversation: true }));
    });
    expect(answer).toMatchObject({ response: { kind: "diagnosis", diagnosis: { answersRequest: "yes" } } });
    expect(sent.map((wire) => wire.model)).toEqual(Array(3).fill("claude-haiku-5-5"));
    // In the conversation (user, system, assistant, user) after tools; on its own request, in the judge's native format, after JSON text.
    expect(sent[2]!.messages).toHaveLength(reaskMessages);
    if (!decisionTools) expect(sent[2]!.output_config?.format?.schema?.properties).not.toHaveProperty("result_json");
  });
});
