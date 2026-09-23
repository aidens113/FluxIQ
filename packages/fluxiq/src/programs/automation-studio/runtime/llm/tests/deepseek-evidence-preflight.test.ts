import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek-provider.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmTaskRequest } from "../harness.ts";
import {
  AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES,
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure,
  type AutomationStudioLlmProviderErrorCode
} from "../provider-contract.ts";

// C-7b. The adapter re-checks every slot of a request that carries evidence
// before anything leaves the process: failure evidence, the explored packets a
// runtime patch is shown, and an evidence loop's gathered results. Each slot is
// held to the rule that built it, to the bound domain's declared keys, and to
// Core's list of credential shapes, and a refusal names the slot by its own
// code without ever repeating what it refused.

/** The web domain's declaration, as it binds it. */
const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;
const DENIED_VALUE = "#PRIVATE-DENIED-VALUE";
const API_KEY = "sk-4f9c2e7b1a6d3058e2c4b7a9d1f6e3c0";
const BEARER = "mF_9.B5f-4.1JqM7xQ2pZ8vK3nR6tY0wL";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLjQyIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----";

describe("the DeepSeek adapter's pre-send check of explored evidence", () => {
  it("sends a runtime patch whose explored packets pass Core's own rule", async () => {
    const recorded = recordingProvider(patchReply());
    await expect(recorded.provider.runTask(patchRequest(slot(page())))).resolves.toMatchObject({ response: { kind: "runtime_patch" } });
    expect(recorded.calls).toEqual({ secrets: 1, transport: 1 });
    expect(recorded.outbound()).toContain("page.revealed");
  });

  it.each([
    ["a key the bound domain denies, at any depth", page({ elements: [{ target: "target.2", selector: DENIED_VALUE }] }), DENIED_VALUE],
    ["a denied key spelled the other way", page({ frame: { outer_html: DENIED_VALUE } }), DENIED_VALUE],
    ["a provider API key", page({ elements: [{ target: "target.2", text: `Your key is ${API_KEY}` }] }), API_KEY],
    ["a bearer credential", page({ note: `Authorization: Bearer ${BEARER}` }), BEARER],
    ["a JSON web token", page({ elements: [{ target: "target.2", name: JWT }] }), JWT],
    ["a private key", page({ note: `${PRIVATE_KEY}\nMIIEowIBAAKCAQEA` }), PRIVATE_KEY]
  ])("refuses a runtime patch whose explored packet carries %s, before the credential is resolved, and never repeats it", async (_label, packet, value) => {
    const recorded = recordingProvider(patchReply());
    const failure = await refusal(recorded.provider.runTask(patchRequest(slot(packet))), "llm.provider_exploration_evidence_invalid");
    expect(recorded.calls).toEqual({ secrets: 0, transport: 0 });
    expect(failure.provenance).toEqual({ providerInvocation: "not_attempted", providerResponse: "not_received" });
    for (const text of [failure.message, String(failure), failure.stack ?? "", JSON.stringify(failure), JSON.stringify(normalizedAutomationStudioLlmProviderFailure(failure))]) {
      expect(text).not.toContain(value);
    }
  });

  it("refuses a slot that is not what Core's packet builder produces", async () => {
    const clean = slot(page());
    const cases: Array<[string, AutomationStudioLlmTaskRequest]> = [
      ["no declared keys", undeclared(patchRequest(clean))],
      ["declared keys that are not a list of names", patchRequest(clean, { deniedEvidenceKeys: [1] as never })],
      ["another task", { ...patchRequest(clean), taskKind: "runtime_diagnosis", expectedOutput: "diagnosis", context: { ...patchRequest(clean).context, taskKind: "runtime_diagnosis" } }],
      ["a label with a colon", patchRequest({ ...clean, packets: [{ ...clean.packets[0]!, evidenceId: "explored:1" }] })],
      ["a label Core never writes", patchRequest({ ...clean, packets: [{ ...clean.packets[0]!, evidenceId: "page.1" }] })],
      ["a repeated label", patchRequest({ ...clean, packets: [clean.packets[0]!, clean.packets[0]!] })],
      ["a field the slot does not have", patchRequest({ ...clean, note: "extra" })],
      ["a field an entry does not have", patchRequest({ ...clean, packets: [{ ...clean.packets[0]!, handles: ["target.2"] }] })],
      ["another schema version", patchRequest({ ...clean, schemaVersion: "automation-studio.exploration-evidence.v0" })],
      ["a negative withheld count", patchRequest({ ...clean, withheldPackets: -1 })],
      ["a packet that names no schema", patchRequest(slot({ controls: ["target.2"] }))],
      ["a string longer than a packet may hold", patchRequest(slot(page({ note: "x".repeat(2_001) })))],
      ["more packets than one exploration can gather", patchRequest({ ...clean, packets: Array.from({ length: 65 }, (_, index) => ({ evidenceId: `explored.${index + 1}`, toolId: "web.recovery.inspect", packet: { schemaVersion: "web-llm-evidence.v2" } })) })]
    ];
    for (const [label, request] of cases) {
      const recorded = recordingProvider(patchReply());
      await refusal(recorded.provider.runTask(request), "llm.provider_exploration_evidence_invalid", label);
      expect(recorded.calls, label).toEqual({ secrets: 0, transport: 0 });
    }
  });

  it("returns the refusal through the harness by code, with nothing of the refused value in the result it records", async () => {
    const recorded = recordingProvider(patchReply());
    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_patch",
      projectId: "project.one",
      flowId: "flow.one",
      runId: "run.one",
      instructions: [],
      deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
      explorationEvidence: { maxBytes: 8_000, packets: [{ evidenceId: "explored.1", toolId: "web.recovery.reveal", packet: page({ note: `Bearer ${BEARER}` }) }] },
      provider: recorded.provider
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_exploration_evidence_invalid");
    expect(recorded.calls).toEqual({ secrets: 0, transport: 0 });
    expect(JSON.stringify(result.diagnostics)).not.toContain(BEARER);
    expect(JSON.stringify(result.intervention)).not.toContain(BEARER);
  });

  it("is a pre-flight refusal of its own", () => {
    expect(AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES).toContain("llm.provider_exploration_evidence_invalid");
  });
});

describe("the DeepSeek adapter's pre-send check of every other evidence slot", () => {
  it("holds failure evidence to the declared keys and the credential shapes, under its own code", async () => {
    const cases: Array<[string, AutomationStudioLlmTaskRequest, string | undefined]> = [
      ["a denied key", diagnosisRequest({ schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", selector: DENIED_VALUE }] }), DENIED_VALUE],
      ["a provider API key", diagnosisRequest({ schemaVersion: "web-llm-evidence.v2", note: API_KEY }), API_KEY],
      ["no declared keys", undeclared(diagnosisRequest({ schemaVersion: "web-llm-evidence.v2" })), undefined]
    ];
    for (const [label, request, value] of cases) {
      const recorded = recordingProvider({ kind: "diagnosis", summary: "Bounded." });
      const failure = await refusal(recorded.provider.runTask(request), "llm.provider_failure_evidence_invalid", label);
      expect(recorded.calls, label).toEqual({ secrets: 0, transport: 0 });
      if (value) expect(JSON.stringify(normalizedAutomationStudioLlmProviderFailure(failure)) + failure.message).not.toContain(value);
    }
    const sent = recordingProvider({ kind: "diagnosis", summary: "Bounded." });
    await expect(sent.provider.runTask(diagnosisRequest({ schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", name: "Submit" }] }))).resolves.toMatchObject({ response: { kind: "diagnosis" } });
  });

  it("holds a result verification's summary to the same rule, under its own code", async () => {
    const cases: Array<[string, AutomationStudioLlmTaskRequest, string | undefined]> = [
      ["a denied key in a sampled row", verificationRequest(resultSummary([{ name: "Hollis", selector: DENIED_VALUE }])), DENIED_VALUE],
      ["a provider API key in a sampled value", verificationRequest(resultSummary([{ name: `key ${API_KEY}` }])), API_KEY],
      ["no declared keys", undeclared(verificationRequest(resultSummary([{ name: "Hollis" }]))), undefined],
      // A build has produced nothing yet, so it has no result to be shown.
      // `runtime_diagnosis` and `runtime_patch` are no longer in this list: a
      // repair entered from a refuted result is repairing exactly what the run
      // produced, and while this check named only the verification, the packet
      // builder put the summary on the patch request and this refused the call
      // outright (t099).
      ["a task that has no finished result to judge", { ...verificationRequest(resultSummary([{ name: "Hollis" }])), taskKind: "flow_bootstrap" as const, promptVersion: "automation-studio.flow-bootstrap.v1", expectedOutput: "flow_bootstrap" as const }, undefined],
      ["a summary past its byte ceiling", verificationRequest(resultSummary([{ name: "y".repeat(5_000) }])), undefined]
    ];
    for (const [label, request, value] of cases) {
      const recorded = recordingProvider({ kind: "diagnosis", summary: "Judged." });
      const failure = await refusal(recorded.provider.runTask(request), "llm.provider_result_summary_invalid", label);
      expect(recorded.calls, label).toEqual({ secrets: 0, transport: 0 });
      if (value) expect(JSON.stringify(normalizedAutomationStudioLlmProviderFailure(failure)) + failure.message).not.toContain(value);
    }
    const sent = recordingProvider({ kind: "diagnosis", summary: "Judged." });
    await expect(sent.provider.runTask(verificationRequest(resultSummary([{ name: "Hollis Abbott", role: "member" }])))).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    // And the repair that is shown what the run produced is sent, not refused.
    const repairing = recordingProvider({ kind: "diagnosis", summary: "Diagnosed." });
    const diagnosing = verificationRequest(resultSummary([{ name: "Hollis Abbott" }]));
    await expect(repairing.provider.runTask({
      ...diagnosing,
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      expectedOutput: "diagnosis",
      context: { ...diagnosing.context, taskKind: "runtime_diagnosis", promptVersion: "automation-studio.runtime-diagnosis.v1" }
    })).resolves.toMatchObject({ response: { kind: "diagnosis" } });
  });

  it("is a pre-flight refusal of its own", () => {
    expect(AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES).toContain("llm.provider_result_summary_invalid");
  });

  it("holds an evidence loop's gathered results to the same rule, under the loop's code", async () => {
    const cases: Array<[string, AutomationStudioLlmTaskRequest, string | undefined]> = [
      ["a denied key", decisionRequest([{ callId: "call.1", toolId: "web.recovery.inspect", value: { schemaVersion: "web-llm-evidence.v2", cookies: DENIED_VALUE } }]), DENIED_VALUE],
      ["a JSON web token", decisionRequest([{ callId: "call.1", toolId: "web.recovery.inspect", value: { title: JWT } }]), JWT],
      ["no declared keys", undeclared(decisionRequest([{ callId: "call.1", toolId: "web.recovery.inspect", value: { observed: true } }])), undefined]
    ];
    for (const [label, request, value] of cases) {
      const recorded = recordingProvider(decisionReply());
      const failure = await refusal(recorded.provider.runTask(request), "llm.provider_evidence_loop_context_invalid", label);
      expect(recorded.calls, label).toEqual({ secrets: 0, transport: 0 });
      if (value) expect(JSON.stringify(normalizedAutomationStudioLlmProviderFailure(failure)) + failure.message).not.toContain(value);
    }
    // A decision with nothing gathered yet carries no evidence, so it needs no declaration.
    const first = recordingProvider(decisionReply());
    await expect(first.provider.runTask(undeclared(decisionRequest([])))).resolves.toMatchObject({ response: { kind: "evidence_tool_decision" } });
    const later = recordingProvider(decisionReply());
    await expect(later.provider.runTask(decisionRequest([{ callId: "call.1", toolId: "web.recovery.inspect", value: { observed: true } }]))).resolves.toMatchObject({ response: { kind: "evidence_tool_decision" } });
  });
});

function page(extra: JsonObject = {}): JsonObject {
  return { schemaVersion: "web-llm-evidence.v2", location: "https://example.test/page.revealed", elements: [{ target: "target.2", tag: "button", name: "Place order" }], ...extra };
}

function slot(packet: JsonObject): { schemaVersion: string; packets: Array<Record<string, unknown>>; withheldPackets: number } & Record<string, unknown> {
  return { schemaVersion: "automation-studio.exploration-evidence.v1", packets: [{ evidenceId: "explored.1", toolId: "web.recovery.reveal", packet }], withheldPackets: 0 };
}

function baseRequest(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "request.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 }
    }
  };
}

function patchRequest(explorationEvidence: unknown, overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  const base = baseRequest();
  return {
    ...base,
    taskKind: "runtime_patch",
    promptVersion: "automation-studio.runtime-patch.v1",
    expectedOutput: "runtime_patch",
    context: { ...base.context, taskKind: "runtime_patch", promptVersion: "automation-studio.runtime-patch.v1", nodeId: "submit", explorationEvidence: explorationEvidence as never },
    ...overrides
  };
}

function resultSummary(rows: JsonObject[]): JsonObject {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 240,
    totalRefusedCount: 0,
    recordSetCount: 1,
    recordSets: [{ datasetId: "members", recordCount: 240, refusedCount: 0, truncated: false, columns: Object.keys(rows[0] ?? {}), columnsWithheld: false, sampleRows: rows }],
    flowShape: [{ nodeId: "n1", definitionId: "builtin.navigate" }],
    withheld: true
  };
}

function verificationRequest(summary: JsonObject, overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  const base = baseRequest();
  return {
    ...base,
    taskKind: "loop_verification",
    promptVersion: "automation-studio.loop-verification.v1",
    expectedOutput: "diagnosis",
    context: { ...base.context, taskKind: "loop_verification", promptVersion: "automation-studio.loop-verification.v1", resultSummary: summary as never },
    ...overrides
  };
}

function diagnosisRequest(failureEvidence: JsonObject, overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  const base = baseRequest();
  return { ...base, context: { ...base.context, failureEvidence }, ...overrides };
}

function decisionRequest(evidence: Array<{ callId: string; toolId: string; value: JsonObject }>, overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  const base = baseRequest();
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    ...base,
    taskKind: "evidence_tool_decision",
    promptVersion: "automation-studio.evidence-tool-decision.v1",
    expectedOutput: "evidence_tool_decision",
    context: {
      ...base.context,
      taskKind: "evidence_tool_decision",
      promptVersion: "automation-studio.evidence-tool-decision.v1",
      evidenceLoop: { iteration: 2, tools, evidence, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true), completionSchema, canComplete: true }
    },
    ...overrides
  };
}

function patchReply(): JsonObject {
  return { kind: "runtime_patch", summary: "Re-point the action.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "submit", target: { handles: { element: "explored.1:target.2" } }, reason: "The control was revealed." }] };
}

function decisionReply(): JsonObject {
  return { kind: "evidence_tool_decision", summary: "Enough.", decision: { kind: "complete", result: {} } };
}

/** The same request with no declaration at all: absent, not an empty list. */
function undeclared(request: AutomationStudioLlmTaskRequest): AutomationStudioLlmTaskRequest {
  const { deniedEvidenceKeys: _declared, ...rest } = request;
  return rest;
}

/** A DeepSeek adapter whose credential and transport are counted, answering with `reply`. */
function recordingProvider(reply: JsonObject) {
  const calls = { secrets: 0, transport: 0 };
  let body = "";
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (input) => {
      calls.secrets += 1;
      body = input.outboundBody;
      return "test-secret";
    },
    fetchImpl: (async () => {
      calls.transport += 1;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  return { provider, calls, outbound: () => body };
}

async function refusal(promise: Promise<unknown>, code: AutomationStudioLlmProviderErrorCode, label: string = code): Promise<AutomationStudioLlmProviderError> {
  const failure = await promise.then(() => undefined, (error: unknown) => error);
  expect(failure, label).toBeInstanceOf(AutomationStudioLlmProviderError);
  expect((failure as AutomationStudioLlmProviderError).code, label).toBe(code);
  return failure as AutomationStudioLlmProviderError;
}
