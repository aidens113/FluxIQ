// Creating a Flow survives a bad reply, under a real grant and the real adapter.
//
// A runtime recovery already did: a malformed reply or a timeout spends one
// call, the grant carries on, and the exploration asks again. Flow creation did
// not. Its exploration propagated the first bad decision and ended, so one
// malformed object from the model ended the whole creation -- and the grant was
// revoked with it. These drive `generateFlowBootstrapAdaptation` the way the
// host binds it (`programs/_shared/runtime.ts`): a person's `build_and_adapt`
// grant, resolved for exactly the task kinds creation may spend it on, into
// the real `createAutomationStudioDeepSeekProvider`. Only the network and the
// credential store are stand-ins.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError, type AutomationStudioFlowBootstrapFailureDiagnostic } from "../flow-bootstrap/index.ts";
import { AutomationStudioLlmExecutionGrantService, type AutomationStudioLlmEvidenceRuntimeBinding } from "../llm/index.ts";
import { AutomationStudioService } from "../service.ts";

const KEY_ID = `secret:${randomUUID()}`;
const ACTOR = { actorUserId: "user.lab", actorSessionId: "session.lab" };
const LOOK_TOOL_ID = "demo.look";

/** How the endpoint answers one decision call: a decision, or a failure. */
type Reply = JsonObject | "malformed" | "hang" | "unauthorized";

type Creation = {
  /** The decision calls that reached the endpoint, by loop iteration. */
  sentIterations: number[];
  revealed: string[];
  revoked: string[];
  activeGrantsAfter: number;
  result?: Awaited<ReturnType<AutomationStudioService["generateFlowBootstrapAdaptation"]>>;
  failure?: AutomationStudioFlowBootstrapFailureDiagnostic;
  stored?: Awaited<ReturnType<AutomationStudioService["getFlowBootstrapAdaptation"]>>;
  adaptationCount: number;
};

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-exploration-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function look(iteration: number): JsonObject {
  return { kind: "tool_call", callId: `call.${iteration}`, toolId: LOOK_TOOL_ID, input: { area: `area.${iteration}` } };
}

function complete(): JsonObject {
  return {
    kind: "complete",
    result: {
      summary: "Start and finish.",
      plan: {
        schemaVersion: "0.1",
        router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
        subflows: [{
          key: "primary",
          name: "Primary",
          role: "primary",
          nodes: [
            { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
            { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
          ],
          edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
        }]
      }
    }
  };
}

/** One evidence-guided creation under a real grant, answering each decision call with `reply(call)`. */
async function create(options: {
  maxCalls: number;
  timeoutMs?: number;
  reply: (call: number, iteration: number) => Reply;
  /** What the provider bills each call, and the per-call and run token limits the grant carries. */
  billed?: { promptTokens: number; completionTokens: number };
  tokenLimits?: { maxInputTokens: number; maxOutputTokens: number; maxTotalTokens: number };
  maxTotalTokensPerRun?: number;
}): Promise<Creation> {
  const sentIterations: number[] = [];
  const revealed: string[] = [];
  const revoked: string[] = [];
  const service = new AutomationStudioService({ dataDir: tempRoot });
  const grants = grantService(service, endpoint(options.reply, sentIterations, options.billed), revealed);
  const tokenLimits = options.tokenLimits ?? { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };
  service.bindLlmExecutionProvider(
    (input) => input.executionGrant
      ? grants.resolve({ ...input.executionGrant, projectId: input.projectId, flowId: input.flowId }, { allowedTaskKinds: ["flow_bootstrap", "evidence_tool_decision"] })
      : undefined,
    (grantId) => {
      revoked.push(grantId);
      grants.revoke(grantId);
    },
    () => grants.close()
  );
  service.bindLlmEvidenceRuntime(lookBinding());
  try {
    const project = await service.createProject({ name: "Bootstrap exploration" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.created", name: "Blank Flow" });
    const now = Date.now();
    await service.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.build",
      title: "Build a primary path",
      body: "Create a deterministic Start to End Flow.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const binding = await service.getLlmExecutionBinding(project.id, flow.flowId);
    const grant = await grants.issue({
      ...ACTOR,
      keyId: KEY_ID,
      projectId: project.id,
      flowId: flow.flowId,
      provider: "deepseek",
      model: "deepseek-chat",
      purpose: "build_and_adapt",
      maxCalls: options.maxCalls,
      tokenLimits,
      maxTotalTokensPerRun: options.maxTotalTokensPerRun ?? tokenLimits.maxTotalTokens * options.maxCalls,
      highTokenConfirmation: true,
      timeoutMs: options.timeoutMs ?? 25_000,
      maxEstimatedCostUsd: 0.25,
      maxTotalEstimatedCostUsd: 2
    });
    const creation: Creation = { sentIterations, revealed, revoked, activeGrantsAfter: -1, adaptationCount: 0 };
    try {
      creation.result = await service.generateFlowBootstrapAdaptation({
        projectId: project.id,
        flowId: flow.flowId,
        evidenceGuided: true,
        executionGrant: { grantId: grant.grantId, ...ACTOR, purpose: "build_and_adapt", executionDigest: binding.executionDigest, settingsRevision: binding.settingsRevision }
      });
      creation.stored = await service.getFlowBootstrapAdaptation(project.id, flow.flowId, creation.result.adaptationId);
    } catch (error) {
      const failure = parseAutomationStudioFlowBootstrapGenerationError(error);
      if (!failure) throw error;
      creation.failure = failure;
    }
    creation.activeGrantsAfter = grants.activeGrantCount();
    creation.adaptationCount = (await service.listFlowAdaptationSummaries({ projectId: project.id, limit: 10, offset: 0 })).total;
    return creation;
  } finally {
    grants.close();
    await service.close();
  }
}

/** One observing tool, no opening observation, so the first decision has to look. */
function lookBinding(): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "demo",
    deniedEvidenceKeys: [],
    tools: [{
      toolId: LOOK_TOOL_ID,
      description: "Look at one area of the demo site.",
      inputSchema: { type: "object", additionalProperties: false, required: ["area"], properties: { area: { type: "string", maxLength: 40 } } },
      effect: "observe"
    }],
    executeTool: async (input) => ({ area: String(input.value.area), headings: ["Welcome"] })
  };
}

/** The grant service with Identity Access and Secret Keys stood in. */
function grantService(service: AutomationStudioService, fetchImpl: typeof fetch, revealed: string[]): AutomationStudioLlmExecutionGrantService {
  const key = { id: KEY_ID, name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-chat" } };
  let minted = 0;
  const secretKeys = {
    getKeySummary: async () => ({ ...key }),
    createSessionRevealAuthorization: async (input: { ttlMs?: number; nowMs?: number }) => {
      minted += 1;
      return { authorizationId: `secret-reveal:${minted}`, keyId: key.id, keyUpdatedAtMs: key.updatedAtMs, expiresAtMs: (input.nowMs ?? Date.now()) + (input.ttlMs ?? 60_000), remainingUses: 1 };
    },
    revealKeyWithAuthorization: async (input: { id: string }) => {
      revealed.push(input.id);
      return { key: { ...key }, value: "test-deepseek-credential" };
    },
    revokeRevealAuthorization: () => {}
  };
  const identityAccess = { validateSession: async () => ({ user: { id: ACTOR.actorUserId }, session: {}, role: {} }) };
  return new AutomationStudioLlmExecutionGrantService({
    identityAccess: identityAccess as unknown as ConstructorParameters<typeof AutomationStudioLlmExecutionGrantService>[0]["identityAccess"],
    secretKeys: secretKeys as unknown as ConstructorParameters<typeof AutomationStudioLlmExecutionGrantService>[0]["secretKeys"],
    resolveExecutionDigest: async (projectId, flowId) => await service.getLlmExecutionBinding(projectId, flowId),
    fetchImpl
  });
}

/** DeepSeek's endpoint, answering the n-th decision call as the case says. */
function endpoint(
  reply: (call: number, iteration: number) => Reply,
  sentIterations: number[],
  billed: { promptTokens: number; completionTokens: number } = { promptTokens: 1_200, completionTokens: 150 }
): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")?.content ?? "{}") as {
      taskKind: string;
      context: { evidenceLoop?: { iteration: number } };
    };
    if (user.taskKind !== "evidence_tool_decision") throw new Error(`The stub endpoint was asked for ${user.taskKind}.`);
    const iteration = user.context.evidenceLoop?.iteration ?? 0;
    sentIterations.push(iteration);
    const answer = reply(sentIterations.length, iteration);
    if (answer === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")), { once: true });
      });
    }
    if (answer === "unauthorized") return new Response(JSON.stringify({ error: { message: "Authentication Fails" } }), { status: 401, headers: { "content-type": "application/json" } });
    const content = answer === "malformed"
      ? "{\"kind\":\"evidence_tool_decision\",\"summary\":"
      : JSON.stringify({ kind: "evidence_tool_decision", summary: "Exploring the demo site.", decision: answer });
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: billed.promptTokens, completion_tokens: billed.completionTokens, total_tokens: billed.promptTokens + billed.completionTokens }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("creating a Flow through an exploration, under a real grant", () => {
  it("asks again after a malformed decision, keeps the grant, and creates the Flow", async () => {
    const run = await create({ maxCalls: 6, reply: (call, iteration) => call === 1 ? "malformed" : iteration === 2 ? look(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // The same grant paid for all three: the bad reply did not end it.
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.revealed).toHaveLength(3);
    expect(run.stored?.evidenceTrace?.map((step) => step.decision)).toEqual(["unusable", "tool_call", "complete"]);
    // A bad reply is kept as a step that names nothing: no tool, no content.
    expect(run.stored?.evidenceTrace?.[0]).toEqual({ iteration: 1, decision: "unusable" });
    expect(run.stored?.evidenceTrace?.[1]).toMatchObject({ iteration: 2, callId: "call.2", toolId: LOOK_TOOL_ID });
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, decisionCount: 3, toolCallCount: 1 });
    // Released when creation ended, not before.
    expect(run.revoked).toEqual([expect.stringMatching(/^llm-grant:/)]);
    expect(run.activeGrantsAfter).toBe(0);
  }, 60_000);

  // The deadline is generous on purpose. A deadline that falls before the grant
  // has released the credential ends the grant -- by design, as its own
  // authorization steps were cut off -- and a heavily loaded machine can take a
  // second to get there.
  it("asks again after a decision that runs past its deadline", async () => {
    const run = await create({ maxCalls: 6, timeoutMs: 3_000, reply: (call, iteration) => call === 1 ? "hang" : iteration === 2 ? look(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.activeGrantsAfter).toBe(0);
  }, 30_000);

  it("stops after three unusable decisions in a row with a named outcome, and releases the grant", async () => {
    const run = await create({ maxCalls: 12, reply: () => "malformed" });

    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.revealed).toHaveLength(3);
    expect(run.failure).toEqual({
      code: "flow_bootstrap.evidence_unusable_decision",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      // Three malformed replies were paid for nothing, so the record says so.
      accounting: expect.objectContaining({ provider: "deepseek", model: "deepseek-chat", inputTokens: 0, totalTokens: 0 }),
      evidenceLoop: { iterationCount: 3, decisionCount: 3, toolCallCount: 0, evidenceBytes: 0 },
      issueCodes: ["llm.provider_malformed_response"]
    });
    expect(run.adaptationCount).toBe(0);
    expect(run.revoked).toHaveLength(1);
    expect(run.activeGrantsAfter).toBe(0);
  }, 60_000);

  it("does not count bad replies across a good one", async () => {
    // bad, look, bad, look, bad, bad, complete: never three in a row.
    const script: Reply[] = ["malformed", look(2), "malformed", look(4), "malformed", "malformed", complete()];
    const run = await create({ maxCalls: 8, reply: (call) => script[call - 1]! });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    expect(run.sentIterations).toEqual([1, 2, 3, 4, 5, 6, 7]);
  }, 60_000);

  it("still ends at once, and revokes, when the provider rejects the credential", async () => {
    const run = await create({ maxCalls: 6, reply: () => "unauthorized" });

    expect(run.sentIterations).toEqual([1]);
    expect(run.failure).toMatchObject({ code: "flow_bootstrap.provider_auth_failed", stage: "provider_request", providerInvocation: "attempted" });
    expect(run.adaptationCount).toBe(0);
    expect(run.revoked).toHaveLength(1);
    expect(run.activeGrantsAfter).toBe(0);
  }, 60_000);

  // The loop's ceiling rose from sixteen, but the trace kept for a created Flow
  // and the failure diagnostic were still bounded at sixteen: a longer
  // exploration that finished could not be saved, and one that ran out lost its
  // named reason to a generic transport failure.
  it("saves a creation that looked more than sixteen times", async () => {
    const run = await create({ maxCalls: 20, reply: (_call, iteration) => iteration <= 18 ? look(iteration) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.sentIterations).toHaveLength(19);
    expect(run.stored?.evidenceTrace).toHaveLength(19);
    // Nineteen requests' estimates add up past one request's ceiling, which
    // is what the build's accounting used to be held to.
    expect(run.result?.accounting.estimatedInputTokens).toBeGreaterThan(50_000);
  }, 120_000);

  // The build's recorded totals were held to 50,000 -- one request's ceiling --
  // so a build its grant allowed 100,000 tokens failed after using 60,000, with
  // every call already paid for.
  it("records a build's token totals past one request's ceiling when its grant allows them", async () => {
    const run = await create({
      // Nine calls at 12,000 is what lets a grant authorise a 100,000 run.
      maxCalls: 9,
      tokenLimits: { maxInputTokens: 10_000, maxOutputTokens: 2_000, maxTotalTokens: 12_000 },
      maxTotalTokensPerRun: 100_000,
      billed: { promptTokens: 10_000, completionTokens: 2_000 },
      reply: (_call, iteration) => iteration <= 4 ? look(iteration) : complete()
    });

    expect(run.failure).toBeUndefined();
    expect(run.sentIterations).toHaveLength(5);
    expect(run.result?.accounting).toMatchObject({ inputTokens: 50_000, outputTokens: 10_000, totalTokens: 60_000 });
    expect(run.stored?.accounting).toMatchObject({ totalTokens: 60_000 });
  }, 60_000);

  it("names the ending of an exploration that ran out after more than sixteen decisions", async () => {
    const run = await create({ maxCalls: 20, reply: (_call, iteration) => look(iteration) });

    expect(run.sentIterations).toHaveLength(20);
    expect(run.failure).toMatchObject({ code: "flow_bootstrap.evidence_iteration_limit", evidenceLoop: { iterationCount: 20, toolCallCount: 20 } });
    expect(run.activeGrantsAfter).toBe(0);
  }, 120_000);
});
