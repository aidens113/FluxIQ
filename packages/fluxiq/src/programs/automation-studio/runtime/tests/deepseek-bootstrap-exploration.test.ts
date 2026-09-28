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
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNativeNodeImplementation } from "../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../flow-bootstrap/plan/tests/index.ts";
import {
  automationStudioFlowBootstrapDeclaredRecordsPath,
  parseAutomationStudioFlowBootstrapGenerationError,
  type AutomationStudioFlowBootstrapFailureDiagnostic
} from "../flow-bootstrap/index.ts";
import { AutomationStudioLlmExecutionGrantService, AutomationStudioLlmProviderError, type AutomationStudioLlmEvidenceRuntimeBinding } from "../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";
import { AutomationStudioService } from "../service.ts";

const KEY_ID = `secret:${randomUUID()}`;
const ACTOR = { actorUserId: "user.lab", actorSessionId: "session.lab" };
const LOOK_TOOL_ID = "demo.look";

/** How the endpoint answers one decision call: a decision, or a failure. */
type Reply = JsonObject | "malformed" | "timeout_after_send" | "unauthorized";

type DecisionObservation = {
  iteration: number;
  offeredDecisionKinds: string[];
  evidence: Array<{ toolId: string; issueCodes: string[] }>;
  completionFeedback: string[];
  draft: {
    present: boolean;
    bytes: number;
    budget: number;
    steps: number;
    unlisted: number;
    withoutInput: number;
    inputTooLarge: number;
    overBudget: boolean;
  };
  registeredRecordProducerCount: number;
  visibleRecordProducerCount: number;
};

type Creation = {
  /** The decision calls that reached the endpoint, by loop iteration. */
  sentIterations: number[];
  observations: DecisionObservation[];
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

function recordsPlan(includeExtraction: boolean): JsonObject {
  const nodes: Array<JsonObject & { key: string }> = [
    { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
    { key: "open", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://catalog.example.test/items" } },
    { key: "filter", definitionId: "web.output.dom-type", definitionVersion: "1.0.0", parameters: { selector: "#query", text: "sample" } },
    ...(includeExtraction ? [{
      key: "extract",
      definitionId: "web.output.dom-extract_list",
      definitionVersion: "1.0.0",
      parameters: { extractList: { item: ".item", fields: { name: ".name", price: ".price" }, minItems: 0 } }
    }] : []),
    { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
  ];
  return {
    schemaVersion: "0.1",
    router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes,
      edges: nodes.slice(0, -1).map((node, index) => ({
        key: `edge.${index + 1}`,
        source: { nodeKey: node.key, portId: index === 0 ? "next" : "success" },
        target: { nodeKey: nodes[index + 1]!.key, portId: "in" }
      }))
    }]
  };
}

function cannotAnswerCompletion(): JsonObject {
  return { kind: "complete", result: { summary: "Open and filter the catalog.", plan: recordsPlan(false) } };
}

function answeringCompletion(): JsonObject {
  return { kind: "complete", result: { summary: "Open, filter, and extract the catalog rows.", plan: recordsPlan(true) } };
}

/** One evidence-guided creation under a real grant, answering each decision call with `reply(call)`. */
async function create(options: {
  maxCalls: number;
  reply: (call: number, iteration: number) => Reply;
  /** What the provider bills each call, and the per-call and run token limits the grant carries. */
  billed?: { promptTokens: number; completionTokens: number };
  tokenLimits?: { maxInputTokens: number; maxOutputTokens: number; maxTotalTokens: number };
  maxTotalTokensPerRun?: number;
  instructionBody?: string;
  webRegistry?: boolean;
}): Promise<Creation> {
  const sentIterations: number[] = [];
  const observations: DecisionObservation[] = [];
  const revealed: string[] = [];
  const revoked: string[] = [];
  const service = new AutomationStudioService({ dataDir: tempRoot });
  if (options.webRegistry) service.bindNativeNodeRuntime(webRuntime());
  const registeredRecordProducerIds = new Set(
    options.webRegistry
      ? webDomainNodeDefinitionsFixture()
          .filter((definition) => automationStudioFlowBootstrapDeclaredRecordsPath(definition) !== undefined)
          .map((definition) => definition.id)
      : []
  );
  const grants = grantService(
    service,
    endpoint(options.reply, sentIterations, observations, registeredRecordProducerIds, options.billed),
    revealed
  );
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
    const binding = await service.getLlmExecutionBinding(project.id, flow.flowId);
    const grant = await grants.issue({
      ...ACTOR,
      keyId: KEY_ID,
      projectId: project.id,
      flowId: flow.flowId,
      provider: "deepseek",
      model: "deepseek-flash",
      purpose: "build_and_adapt",
      maxCalls: options.maxCalls,
      tokenLimits,
      maxTotalTokensPerRun: options.maxTotalTokensPerRun ?? tokenLimits.maxTotalTokens * options.maxCalls,
      highTokenConfirmation: true,
      timeoutMs: 25_000,
      maxEstimatedCostUsd: 0.25,
      maxTotalEstimatedCostUsd: 2
    });
    const creation: Creation = { sentIterations, observations, revealed, revoked, activeGrantsAfter: -1, adaptationCount: 0 };
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

/** The grant service with Identity Access and Secret Keys stood in. */
function grantService(service: AutomationStudioService, fetchImpl: typeof fetch, revealed: string[]): AutomationStudioLlmExecutionGrantService {
  const key = { id: KEY_ID, name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };
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
  observations: DecisionObservation[],
  registeredRecordProducerIds: ReadonlySet<string>,
  billed: { promptTokens: number; completionTokens: number } = { promptTokens: 1_200, completionTokens: 150 }
): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")?.content ?? "{}") as {
      taskKind: string;
      outputSchema?: { properties?: { decision?: JsonObject } };
      context: {
        evidenceLoop?: { iteration: number; decisionSchema?: JsonObject; evidence?: Array<{ toolId?: unknown; value?: unknown }> };
        flowBootstrap?: { nodeCatalog?: Array<{ id?: unknown }> };
      };
    };
    if (user.taskKind !== "evidence_tool_decision") throw new Error(`The stub endpoint was asked for ${user.taskKind}.`);
    const iteration = user.context.evidenceLoop?.iteration ?? 0;
    sentIterations.push(iteration);
    const schema = (user.outputSchema?.properties?.decision ?? user.context.evidenceLoop?.decisionSchema) as { properties?: { kind?: { const?: unknown } }; oneOf?: Array<{ properties?: { kind?: { const?: unknown } } }> } | undefined;
    const directKind = schema?.properties?.kind?.const;
    const evidence = user.context.evidenceLoop?.evidence ?? [];
    const completionFeedback = issueCodesForEvidence(evidence, "core.completion_check");
    const draftValue = evidence.find((entry) => entry.toolId === "core.flow_draft")?.value;
    const draft = draftObservation(draftValue, 4_000);
    const visibleRecordProducerCount = new Set(
      (user.context.flowBootstrap?.nodeCatalog ?? []).flatMap((entry) =>
        typeof entry.id === "string" && registeredRecordProducerIds.has(entry.id) ? [entry.id] : []
      )
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
      visibleRecordProducerCount
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

function issueCodesForEvidence(
  evidence: Array<{ toolId?: unknown; value?: unknown }>,
  toolId: string
): string[] {
  return evidence.flatMap((entry) => {
    if (entry.toolId !== toolId || !entry.value || typeof entry.value !== "object" || Array.isArray(entry.value)) return [];
    const value = entry.value as Record<string, unknown>;
    const issues = Array.isArray(value.issues) ? value.issues : [];
    const refused = Array.isArray(value.refused) ? value.refused : [];
    return [
      ...issues.flatMap((issue) =>
        issue && typeof issue === "object" && typeof (issue as Record<string, unknown>).code === "string"
          ? [(issue as Record<string, unknown>).code as string]
          : []
      ),
      ...refused.flatMap((item) =>
        item && typeof item === "object" && typeof (item as Record<string, unknown>).reason === "string"
          ? [(item as Record<string, unknown>).reason as string]
          : []
      )
    ];
  });
}

const PACKED_DRAFT_FIELDS = [
  "step",
  "actionId",
  "input",
  "resultCode",
  "changed",
  "disposition",
  "inResult",
  "replayed",
  "runs",
  "settings"
] as const;

function draftObservation(value: unknown, budget: number): DecisionObservation["draft"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { present: false, bytes: 0, budget, steps: 0, unlisted: 0, withoutInput: 0, inputTooLarge: 0, overBudget: false };
  }
  const draft = value as Record<string, unknown>;
  const steps = Array.isArray(draft.steps) ? draft.steps : [];
  const packed = draft.format === "step_rows_v1";
  const packedFieldsValid = packed
    && Array.isArray(draft.fields)
    && draft.fields.length === PACKED_DRAFT_FIELDS.length
    && draft.fields.every((field, index) => field === PACKED_DRAFT_FIELDS[index]);
  const withoutInput = steps.filter((step) => packed
    ? !packedFieldsValid
      || !Array.isArray(step)
      || step.length < 7
      || step.length > PACKED_DRAFT_FIELDS.length
      || step[2] === null
      || step[2] === undefined
    : !step
      || typeof step !== "object"
      || Array.isArray(step)
      || (!("input" in step) && (step as Record<string, unknown>).inputTooLarge !== true)
  ).length;
  const inputTooLarge = steps.filter((step) => !packed
    && step && typeof step === "object" && !Array.isArray(step) && (step as Record<string, unknown>).inputTooLarge === true
  ).length;
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  return {
    present: true,
    bytes,
    budget,
    steps: steps.length,
    unlisted: typeof draft.unlisted === "number" ? draft.unlisted : 0,
    withoutInput,
    inputTooLarge,
    overBudget: bytes > budget
  };
}

const RECORDS_INSTRUCTION = "Find every catalog item and give me rows with columns name and price.";

function repeatedBuildReply(call: number, convergesAtEleven = false): Reply {
  if (call <= 6) return look(call);
  if (call === 7) return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { area: "area.rerun.7" } }] };
  if (call === 8 || call === 9) return { kind: "amend_draft", amendments: [{ step: 2, change: "optional" }] };
  if (call === 10) return cannotAnswerCompletion();
  if (call === 11 && convergesAtEleven) return answeringCompletion();
  if (call <= 24) return look(call);
  if (call === 25) return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { area: "area.rerun.25" } }] };
  return cannotAnswerCompletion();
}

function feedbackRows(observation: DecisionObservation | undefined, toolId: string): Array<{ toolId: string; issueCodes: string[] }> {
  return observation?.evidence.filter((entry) => entry.toolId === toolId) ?? [];
}

describe("draft observation discriminator", () => {
  it("counts malformed object steps and packed rows as withheld inputs", () => {
    const completePackedRow = [1, LOOK_TOOL_ID, { area: "sample" }, null, "yes", "kept", true];
    const packedDraft = { format: "step_rows_v1", fields: [...PACKED_DRAFT_FIELDS] };

    expect(draftObservation({ steps: [{ input: { area: "sample" } }] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ ...packedDraft, steps: [completePackedRow] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ ...packedDraft, steps: [[...completePackedRow, false, 1, {}]] }, 4_000).withoutInput).toBe(0);
    expect(draftObservation({ steps: [completePackedRow] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, fields: ["step", "input", "actionId", ...PACKED_DRAFT_FIELDS.slice(3)], steps: [completePackedRow] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [completePackedRow.slice(0, 6)] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [[1, LOOK_TOOL_ID, null, null, "yes", "kept", true]] }, 4_000).withoutInput).toBe(1);
    expect(draftObservation({ ...packedDraft, steps: [[...completePackedRow, null, null, null, null]] }, 4_000).withoutInput).toBe(1);
  });
});

describe("creating a Flow through an exploration, under a real grant", () => {
  it("asks again after a malformed decision, keeps the grant, and creates the Flow", async () => {
    const run = await create({ maxCalls: 6, reply: (call, iteration) => call === 1 ? "malformed" : iteration === 2 ? look(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    // The same grant paid for all three: the bad reply did not end it.
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.revealed).toHaveLength(3);
    expect(run.stored?.evidenceTrace?.map((step) => step.decision)).toEqual(["unusable", "tool_call", "complete"]);
    // A bad reply names no tool and carries no content, but it does say what
    // was wrong with it: the stored trace keeps the result code, so a reader of
    // a finished build can tell a malformed reply from a refused step.
    // `toMatchObject`, not `toEqual`: every row now also carries `at`, the
    // moment it was recorded, which is a clock reading and so cannot be
    // asserted exactly. That it is there at all is asserted beside it.
    expect(run.stored?.evidenceTrace?.[0]).toMatchObject({ iteration: 1, decision: "unusable", resultCode: "llm.provider_malformed_response" });
    expect(run.stored?.evidenceTrace?.[0]?.at).toEqual(expect.any(Number));
    expect(run.stored?.evidenceTrace?.[1]).toMatchObject({ iteration: 2, callId: "call.2", toolId: LOOK_TOOL_ID });
    expect(run.stored?.auditEvents[0]?.detail).toMatchObject({ providerCallCount: 3, decisionCount: 3, toolCallCount: 1 });
    // Released when creation ended, not before.
    expect(run.revoked).toEqual([expect.stringMatching(/^llm-grant:/)]);
    expect(run.activeGrantsAfter).toBe(0);
  }, 60_000);

  // The fake endpoint is entered only after the grant released the credential,
  // so this timeout is deterministically a spent provider call. A real timer
  // here used to race the grant's authorization work under root-suite load and
  // sometimes revoked the grant before the endpoint was reached.
  it("asks again after a provider decision reaches its deadline", async () => {
    const run = await create({ maxCalls: 6, reply: (call, iteration) => call === 1 ? "timeout_after_send" : iteration === 2 ? look(2) : complete() });

    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed" });
    expect(run.sentIterations).toEqual([1, 2, 3]);
    expect(run.revealed).toHaveLength(3);
    expect(run.revoked).toHaveLength(1);
    expect(run.activeGrantsAfter).toBe(0);
  }, 30_000);

  // It used to stop after three. Three was the no-progress guard as well as the
  // malformed-reply guard, and it ended builds that were working, so the guard
  // is now a far backstop and what bounds a run of bad replies is what the run
  // may spend -- here the grant's own call count.
  it("stops once a run of unusable decisions has spent what the grant allows, with a named outcome, and releases the grant", async () => {
    const run = await create({ maxCalls: 12, reply: () => "malformed" });

    expect(run.sentIterations).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    expect(run.revealed).toHaveLength(11);
    expect(run.failure).toMatchObject({
      // **What ended this is the grant's call count, and that is what it says.**
      // Neither guard could have fired first: both the no-progress guard and the
      // unusable backstop are held to the loop's own iterations, so on a
      // twelve-call run there is no room beneath the budget for either. It used
      // to be published as `evidence_unusable_decision` at `retryable: false`
      // because the last decision was a refusal -- true of the decision, false
      // of the ending, and the mistake that cost a live debug hours
      // (`runtime/llm/evidence-loop/exhaustion.ts`). The eleven identical
      // refusals travel as issue codes instead, which is where the rest of this
      // record's issue codes already live.
      code: "flow_bootstrap.evidence_iteration_limit",
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      // Every malformed reply was paid for nothing, so the record says so.
      accounting: expect.objectContaining({ provider: "deepseek", model: "deepseek-flash", inputTokens: 0, totalTokens: 0 }),
      // One step per decision, each naming the iteration that paid for it --
      // which is the whole point: eleven refusals reading the same code are
      // told apart by nothing else.
      // `at` rides on every step now, a clock reading rather than a value, so
      // the steps are matched on what they say and their moment is asserted
      // as being present at all.
      evidenceLoop: {
        iterationCount: 12, decisionCount: 11, toolCallCount: 0, evidenceBytes: expect.any(Number),
        // Never a completion attempt, and never a draft step: this build asked
        // for nothing the loop could act on, which the counts now say outright.
        exhausted: { bound: "budget", maxIterations: 12, iterations: 12, draftSteps: 0, proposableSteps: 0, completionAttempts: 0 },
        steps: Array.from({ length: 11 }, (_, index) => ({ toolId: "core.decision_unusable", iteration: index + 1, resultCode: "llm.provider_malformed_response", at: expect.any(Number) }))
      },
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
    // Twenty decisions, nineteen tool calls: the twentieth is the last the
    // budget allows, so it is offered only completion, and a look asked for on
    // it anyway is not run (t057, `llm/loop-budget.ts`).
    expect(run.failure).toMatchObject({ code: "flow_bootstrap.evidence_iteration_limit", evidenceLoop: { iterationCount: 20, toolCallCount: 19 } });
    expect(run.activeGrantsAfter).toBe(0);
  }, 120_000);

  it("reproduces the measured 26-decision creation exhaustion with exact feedback, trace, and accounting", async () => {
    const run = await create({
      maxCalls: 26,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
      instructionBody: RECORDS_INSTRUCTION,
      webRegistry: true,
      reply: (call) => repeatedBuildReply(call)
    });

    expect(run.sentIterations).toEqual(Array.from({ length: 26 }, (_, index) => index + 1));
    expect(run.revealed).toHaveLength(26);
    expect(run.observations.every((observation) => observation.offeredDecisionKinds.length > 0)).toBe(true);
    expect(feedbackRows(run.observations[9], "core.amendment_check")).toEqual([{ toolId: "core.amendment_check", issueCodes: ["already_so"] }]);
    expect(feedbackRows(run.observations[10], "core.completion_check")).toEqual([{ toolId: "core.completion_check", issueCodes: ["bootstrap.cannot_answer_instruction"] }]);
    const postRefusal = run.observations.slice(10);
    expect(postRefusal).toHaveLength(16);
    expect(postRefusal.map((observation) => observation.iteration)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 11)
    );
    expect(postRefusal.map((observation) => observation.completionFeedback)).toEqual(
      Array.from({ length: 16 }, () => ["bootstrap.cannot_answer_instruction"])
    );
    expect(postRefusal.slice(0, -1).map((observation) => observation.offeredDecisionKinds)).toEqual(
      Array.from({ length: 15 }, () => ["complete", "amend_draft", "tool_call"])
    );
    expect(postRefusal.at(-1)?.offeredDecisionKinds).toEqual(["complete"]);
    expect(postRefusal.every((observation) => observation.registeredRecordProducerCount === 1)).toBe(true);
    expect(postRefusal.every((observation) => observation.visibleRecordProducerCount === 1)).toBe(true);
    for (const observation of postRefusal) {
      expect(observation.draft).toMatchObject({
        present: true,
        budget: 4_000,
        steps: observation.iteration - 4,
        unlisted: 0,
        withoutInput: 0,
        inputTooLarge: 0,
        overBudget: false
      });
      expect(observation.draft.bytes).toBeLessThanOrEqual(observation.draft.budget);
    }

    // **This is `run-mulryg6h-ff241a12`'s ending, reproduced.** It used to read
    // `flow_bootstrap.evidence_unusable_decision` / `retryable: false` -- the
    // model's answers blamed for a build that had simply used its twenty-sixth
    // of twenty-six calls. The refusal is still reported, as the issue code it
    // is; the ending is reported as the allowance that ran out, and marked as
    // something a larger budget can retry.
    expect(run.failure).toMatchObject({
      code: "flow_bootstrap.evidence_iteration_limit",
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      issueCodes: ["bootstrap.cannot_answer_instruction"],
      accounting: { provider: "deepseek", model: "deepseek-flash", inputTokens: 31_200, outputTokens: 3_900, totalTokens: 35_100 },
      evidenceLoop: {
        iterationCount: 26, decisionCount: 26, toolCallCount: 22, evidenceBytes: expect.any(Number),
        // How close it came, which is the question the old ending could not be
        // asked: a draft that had grown real steps, and three attempts to finish.
        // `iterations`, and that is the live run's own path: the twenty-sixth
        // decision was made and acted on, so the loop reached the end of its
        // `for` rather than refusing a twenty-seventh it could not pay for.
        exhausted: { bound: "iterations", maxIterations: 26, iterations: 26, draftSteps: expect.any(Number), proposableSteps: expect.any(Number), completionAttempts: expect.any(Number) }
      }
    });
    expect(run.failure?.evidenceLoop?.exhausted?.completionAttempts).toBeGreaterThan(0);
    expect(run.failure?.evidenceLoop?.exhausted?.draftSteps).toBeGreaterThan(0);
    expect(run.failure?.evidenceLoop?.evidenceBytes).toBeGreaterThan(0);
    const steps = run.failure?.evidenceLoop?.steps ?? [];
    expect(steps.filter((step) => step.iteration === 7)).toHaveLength(2);
    expect(steps.filter((step) => step.iteration === 25)).toHaveLength(2);
    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ iteration: 8, resultCode: "llm_evidence_loop.draft_amended", amended: 1 }),
      expect.objectContaining({ iteration: 9, resultCode: "llm_evidence_loop.draft_unchanged", amended: 0, amendmentsRefused: [{ step: 2, reason: "already_so" }] }),
      expect.objectContaining({ iteration: 10, resultCode: "bootstrap.cannot_answer_instruction", progress: expect.objectContaining({ answerabilityState: "first_observed" }), answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false, issueCode: "bootstrap.cannot_answer_instruction" } }),
      expect.objectContaining({ iteration: 26, resultCode: "bootstrap.cannot_answer_instruction", progress: expect.objectContaining({ answerabilityState: "unchanged" }) })
    ]));
    expect(run.result).toBeUndefined();
    expect(run.stored).toBeUndefined();
    expect(run.adaptationCount).toBe(0);
    expect(run.revoked).toEqual([expect.stringMatching(/^llm-grant:/)]);
    expect(run.activeGrantsAfter).toBe(0);
  }, 180_000);

  it("converges from the same prefix when the corrected plan retains the record-producing node", async () => {
    const run = await create({
      maxCalls: 26,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
      instructionBody: RECORDS_INSTRUCTION,
      webRegistry: true,
      reply: (call) => repeatedBuildReply(call, true)
    });

    expect(run.sentIterations).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    expect(feedbackRows(run.observations[10], "core.completion_check")).toEqual([{ toolId: "core.completion_check", issueCodes: ["bootstrap.cannot_answer_instruction"] }]);
    expect(run.observations[10]).toMatchObject({
      iteration: 11,
      completionFeedback: ["bootstrap.cannot_answer_instruction"],
      offeredDecisionKinds: ["complete", "amend_draft", "tool_call"],
      draft: {
        present: true,
        budget: 4_000,
        steps: 7,
        unlisted: 0,
        withoutInput: 0,
        inputTooLarge: 0,
        overBudget: false,
        bytes: expect.any(Number)
      },
      registeredRecordProducerCount: 1,
      visibleRecordProducerCount: 1
    });
    expect(run.observations[10]!.draft.bytes).toBeLessThanOrEqual(run.observations[10]!.draft.budget);
    expect(run.failure).toBeUndefined();
    expect(run.result).toMatchObject({ status: "proposed", accounting: { inputTokens: 13_200, outputTokens: 1_650, totalTokens: 14_850 } });
    expect(run.stored).toBeDefined();
    expect(run.adaptationCount).toBe(1);
    expect(run.stored?.buildPlan.plan.subflows.flatMap((subflow) => subflow.nodes).map((node) => node.definitionId)).toContain("web.output.dom-extract_list");
    expect(run.stored?.evidenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ iteration: 10, decision: "unusable", resultCode: "bootstrap.cannot_answer_instruction" }),
      expect.objectContaining({ iteration: 11, decision: "complete" })
    ]));
    expect(run.revoked).toEqual([expect.stringMatching(/^llm-grant:/)]);
    expect(run.activeGrantsAfter).toBe(0);
  }, 180_000);
});
