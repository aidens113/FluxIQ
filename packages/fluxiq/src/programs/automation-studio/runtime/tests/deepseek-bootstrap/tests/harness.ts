// The shared stub harness for creating a Flow through an exploration, for a
// caller, through the real adapter. It drives
// `generateFlowBootstrapAdaptation` the way the host binds it
// (`programs/_shared/runtime.ts`): the session-key resolver, which needs no
// grant -- the caller's own key is released per call -- into the real
// `createAutomationStudioDeepSeekProvider`. Only the network (`endpoint`) and
// the credential store (`sessionKeyPorts`) are stand-ins. A test file calls
// `useBootstrapTempRoot()` once at its top level so each case gets its own
// data directory.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNativeNodeImplementation } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import {
  automationStudioFlowBootstrapDeclaredRecordsPath,
  parseAutomationStudioFlowBootstrapGenerationError,
  type AutomationStudioFlowBootstrapFailureDiagnostic
} from "../../../flow-bootstrap/index.ts";
import { AutomationStudioLlmProviderError, createAutomationStudioSessionKeyProviderResolver, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioSessionKeyPorts } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { draftObservation, issueCodesForEvidence, type DecisionObservation } from "./observation.ts";
import { LOOK_TOOL_ID, type JudgeReply, type Reply } from "./replies.ts";

const KEY_ID = `secret:${randomUUID()}`;
const ACTOR = { actorUserId: "user.lab", actorSessionId: "session.lab" };

/** What one judge call was shown: the build test's notes, and its steps' actions. */
export type JudgeRequest = {
  /** The judge call's number, counted apart from decisions. */
  call: number;
  notes: Array<{ code?: unknown; said?: unknown; columns?: unknown }>;
  stepCount: number;
};

/** What a judge call bills, distinct from a decision's, so the build's accounting tells the two apart. */
const JUDGE_BILLED = { promptTokens: 400, completionTokens: 40 } as const;

export type Creation = {
  /** The decision calls that reached the endpoint, by loop iteration. */
  sentIterations: number[];
  observations: DecisionObservation[];
  revealed: string[];
  /** The judge calls that reached the endpoint, in order, apart from the decisions. */
  judgeRequests: JudgeRequest[];
  result?: Awaited<ReturnType<AutomationStudioService["generateFlowBootstrapAdaptation"]>>;
  failure?: AutomationStudioFlowBootstrapFailureDiagnostic;
  stored?: Awaited<ReturnType<AutomationStudioService["getFlowBootstrapAdaptation"]>>;
  adaptationCount: number;
};

let tempRoot: string;

/** Gives every case of the calling test file its own data directory, removed after it. */
export function useBootstrapTempRoot(): void {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-exploration-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
}

/** One evidence-guided creation for a caller, answering each decision call with `reply(call)`. */
export async function create(options: {
  maxCalls: number;
  reply: (call: number, iteration: number) => Reply;
  /** What the provider bills each call, and the per-call and run token limits the resolution carries. */
  billed?: { promptTokens: number; completionTokens: number };
  tokenLimits?: { maxInputTokens: number; maxOutputTokens: number; maxTotalTokens: number };
  maxTotalTokensPerRun?: number;
  instructionBody?: string;
  webRegistry?: boolean;
  /** The judge's answer to its n-th call; `yes` when the case scripts none. */
  judge?: (judgeCall: number) => JudgeReply;
}): Promise<Creation> {
  const sentIterations: number[] = [];
  const observations: DecisionObservation[] = [];
  const revealed: string[] = [];
  const judgeRequests: JudgeRequest[] = [];
  const service = new AutomationStudioService({ dataDir: tempRoot });
  if (options.webRegistry) service.bindNativeNodeRuntime(webRuntime());
  const registeredRecordProducerIds = new Set(
    options.webRegistry
      ? webDomainNodeDefinitionsFixture()
          .filter((definition) => automationStudioFlowBootstrapDeclaredRecordsPath(definition) !== undefined)
          .map((definition) => definition.id)
      : []
  );
  const resolveForCaller = createAutomationStudioSessionKeyProviderResolver({
    ports: sessionKeyPorts(revealed),
    fetchImpl: endpoint({
      reply: options.reply,
      judge: options.judge ?? (() => ({ answersRequest: "yes" })),
      sentIterations,
      observations,
      judgeRequests,
      registeredRecordProducerIds,
      ...(options.billed ? { billed: options.billed } : {})
    })
  });
  // Small per-call limits, so the run budgets these cases measure bind as they were calibrated. They were 8,000 / 2,000 /
  // 10,000; the whole node catalog rides in every request since 2026-09-30, and a request that size no longer holds it.
  const tokenLimits = options.tokenLimits ?? { maxInputTokens: 20_000, maxOutputTokens: 2_000, maxTotalTokens: 22_000 };
  // The host's resolver, with the per-call and run limits each case sets as
  // budget defaults on the resolution. Nothing is issued or checked first.
  service.bindLlmExecutionProvider((input) => {
    const resolution = resolveForCaller(input);
    if (!resolution) return undefined;
    return {
      ...resolution,
      maxCallsPerRun: options.maxCalls,
      tokenLimits,
      maxTotalTokensPerRun: options.maxTotalTokensPerRun ?? tokenLimits.maxTotalTokens * options.maxCalls,
      timeoutMs: 25_000,
      maxEstimatedCostUsd: 0.25,
      maxTotalEstimatedCostUsd: 2
    };
  });
  service.bindLlmEvidenceRuntime(lookBinding(options.webRegistry ? "web-automation" : "demo", options.webRegistry === true));
  try {
    const project = await service.createProject({ name: "Bootstrap exploration", ...(options.webRegistry ? { domainId: "web-automation" } : {}) });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.created", name: "Blank Flow" });
    const now = Date.now();
    await service.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.build",
      title: "Build a primary path",
      body: options.instructionBody ?? "Create a deterministic Start to End Flow.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const creation: Creation = { sentIterations, observations, revealed, judgeRequests, adaptationCount: 0 };
    try {
      creation.result = await service.generateFlowBootstrapAdaptation({
        projectId: project.id,
        flowId: flow.flowId,
        evidenceGuided: true,
        caller: ACTOR
      });
      creation.stored = await service.getFlowBootstrapAdaptation(project.id, flow.flowId, creation.result.adaptationId);
    } catch (error) {
      const failure = parseAutomationStudioFlowBootstrapGenerationError(error);
      if (!failure) throw error;
      creation.failure = failure;
    }
    creation.adaptationCount = (await service.listFlowAdaptationSummaries({ projectId: project.id, limit: 10, offset: 0 })).total;
    return creation;
  } finally {
    await service.close();
  }
}

/** One observing tool, no opening observation, so the first decision has to look. */
function lookBinding(domainId = "demo", recordsDraftSteps = false): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId,
    deniedEvidenceKeys: [],
    tools: [{
      toolId: LOOK_TOOL_ID,
      description: "Look at one area of the demo site.",
      inputSchema: { type: "object", additionalProperties: false, required: ["area"], properties: { area: { type: "string", maxLength: 40 } } },
      effect: recordsDraftSteps ? "mutate" : "observe"
    }],
    executeTool: async (input) => recordsDraftSteps
      ? {
          kind: "llm_evidence_tool_execution",
          evidence: { area: String(input.value.area), status: "changed" },
          effectApplied: true,
          resultCode: "demo.action.succeeded",
          draft: { actionId: LOOK_TOOL_ID, input: { area: String(input.value.area) }, effect: "mutate", proposes: true }
        }
      : { area: String(input.value.area), headings: ["Welcome"] }
  };
}

function webRuntime(): AutomationStudioNativeNodeRuntime {
  const definitions = webDomainNodeDefinitionsFixture();
  const implementations = Object.fromEntries(definitions.map((definition): [string, AutomationStudioNativeNodeImplementation] => {
    const implementationKey = definition.source.kind === "importer" ? definition.source.implementationKey : definition.id;
    return [implementationKey, () => ({ status: "success", route: "success", outputs: { success: true } })];
  }));
  return new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "@fluxiq-web-extension/domain",
    packageVersion: "1.0.0",
    domainId: "web-automation",
    nodes: definitions
  }, {
    packageId: "@fluxiq-web-extension/domain",
    packageVersion: "1.0.0",
    implementations
  });
}

/** Secret Keys stood in: one enabled DeepSeek key, released per call to the caller's session. */
function sessionKeyPorts(revealed: string[]): AutomationStudioSessionKeyPorts {
  let minted = 0;
  return {
    snapshot: async () => ({ keys: [{ id: KEY_ID, kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1 }] }),
    createSessionRevealAuthorization: async (input) => {
      minted += 1;
      return { authorizationId: `secret-reveal:${minted}`, keyId: input.id, keyUpdatedAtMs: 1 };
    },
    revealKeyWithAuthorization: async (input) => {
      revealed.push(input.id);
      return { value: "test-deepseek-credential" };
    },
    revokeRevealAuthorization: () => {}
  };
}

/**
 * DeepSeek's endpoint, answering the n-th decision call as the case says, and
 * the n-th judge call (`loop_verification`) as the case's judge says. The two
 * are counted apart: a judge call is paid for, but it is not a decision.
 */
function endpoint(options: {
  reply: (call: number, iteration: number) => Reply;
  judge: (judgeCall: number) => JudgeReply;
  sentIterations: number[];
  observations: DecisionObservation[];
  judgeRequests: JudgeRequest[];
  registeredRecordProducerIds: ReadonlySet<string>;
  billed?: { promptTokens: number; completionTokens: number };
}): typeof fetch {
  const { reply, sentIterations, observations, registeredRecordProducerIds } = options;
  const billed = options.billed ?? { promptTokens: 1_200, completionTokens: 150 };
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")?.content ?? "{}") as {
      taskKind: string;
      outputSchema?: { properties?: { decision?: JsonObject } };
      context: {
        evidenceLoop?: { iteration: number; decisionSchema?: JsonObject; evidence?: Array<{ toolId?: unknown; value?: unknown }> };
        // Names only since 2026-10-01: `{ category: ["<id>: <description>"] }`, not the full entries it was.
        flowBootstrap?: { nodeCatalog?: Record<string, unknown> };
        resultSummary?: { buildTest?: { notes?: JudgeRequest["notes"]; steps?: unknown[] } };
      };
    };
    if (user.taskKind === "loop_verification") {
      const buildTest = user.context.resultSummary?.buildTest;
      const call = options.judgeRequests.length + 1;
      options.judgeRequests.push({
        call,
        notes: buildTest?.notes ?? [],
        stepCount: buildTest?.steps?.length ?? 0
      });
      const { answersRequest, ...said } = options.judge(call);
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "Judged the build's test.", diagnosis: { answersRequest, ...said } }) } }],
        usage: { prompt_tokens: JUDGE_BILLED.promptTokens, completion_tokens: JUDGE_BILLED.completionTokens, total_tokens: JUDGE_BILLED.promptTokens + JUDGE_BILLED.completionTokens }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (user.taskKind !== "evidence_tool_decision") throw new Error(`The stub endpoint was asked for ${user.taskKind}.`);
    const iteration = user.context.evidenceLoop?.iteration ?? 0;
    sentIterations.push(iteration);
    const schema = (user.outputSchema?.properties?.decision ?? user.context.evidenceLoop?.decisionSchema) as { properties?: { kind?: { const?: unknown } }; oneOf?: Array<{ properties?: { kind?: { const?: unknown } } }> } | undefined;
    const directKind = schema?.properties?.kind?.const;
    const evidence = user.context.evidenceLoop?.evidence ?? [];
    const completionFeedback = issueCodesForEvidence(evidence, "core.completion_check");
    const draftValue = evidence.find((entry) => entry.toolId === "core.flow_draft")?.value;
    const draft = draftObservation(draftValue, 4_000);
    const resumedValue = evidence.find((entry) => entry.toolId === "core.resumed")?.value;
    const visibleRecordProducerCount = new Set(
      Object.values(user.context.flowBootstrap?.nodeCatalog ?? {}).flatMap((lines) => Array.isArray(lines) ? lines : []).flatMap((line) => {
        const id = typeof line === "string" ? line.slice(0, line.indexOf(":")) : undefined;
        return id && registeredRecordProducerIds.has(id) ? [id] : [];
      })
    ).size;
    observations.push({
      iteration,
      offeredDecisionKinds: [
        ...(typeof directKind === "string" ? [directKind] : []),
        ...(schema?.oneOf ?? []).flatMap((variant) => typeof variant.properties?.kind?.const === "string" ? [variant.properties.kind.const] : [])
      ],
      evidence: evidence.flatMap((entry) => {
        if (typeof entry.toolId !== "string") return [];
        const value = entry.value && typeof entry.value === "object" && !Array.isArray(entry.value) ? entry.value as Record<string, unknown> : {};
        const issues = Array.isArray(value.issues) ? value.issues : [];
        const refused = Array.isArray(value.refused) ? value.refused : [];
        const issueCodes = [
          ...issues.flatMap((issue) => issue && typeof issue === "object" && typeof (issue as Record<string, unknown>).code === "string" ? [(issue as Record<string, unknown>).code as string] : []),
          ...refused.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).reason === "string" ? [(item as Record<string, unknown>).reason as string] : [])
        ];
        return [{ toolId: entry.toolId, issueCodes }];
      }),
      completionFeedback,
      draft,
      registeredRecordProducerCount: registeredRecordProducerIds.size,
      visibleRecordProducerCount,
      ...(resumedValue && typeof resumedValue === "object" && !Array.isArray(resumedValue) ? { resumed: resumedValue as Record<string, unknown> } : {})
    });
    const answer = reply(sentIterations.length, iteration);
    if (answer === "timeout_after_send") {
      throw new AutomationStudioLlmProviderError("llm.provider_timeout", "The test endpoint reached its deadline.", true);
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
