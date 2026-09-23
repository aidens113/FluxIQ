// The real DeepSeek adapter, on the requests a real recovery builds.
//
// Every live runtime recovery against DeepSeek made exactly one provider call,
// a `runtime_diagnosis` at `gather`, and it ended `llm.provider_configuration_invalid`
// with no usage: the adapter refused the request before it was sent. Nothing
// caught it because every recovery test drove a scripted provider, which
// accepts whatever it is handed, and every adapter test built its request by
// hand, which never carried what a real failed run carries.
//
// These drive the whole recovery path -- the grant a person issues, the
// provider it resolves, the packet the harness builds from a failed run -- into
// the real `createAutomationStudioDeepSeekProvider`. Only the network and the
// credential store are stand-ins. A request the adapter would refuse therefore
// fails here, in CI, instead of in a live run.
//
// The failed run is shaped the way the web domain's are: the attempt carries a
// structured `target_not_found` failure record, and the domain captures a
// sanitized page packet and offers an observing tool. The grant carries the
// limits the live run used.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunDetail
} from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import {
  AutomationStudioLlmExecutionGrantService,
  automationStudioRuntimeAdaptationContextForGrant,
  automationStudioRuntimeSessionGrantTaskKinds,
  createAutomationStudioDeepSeekProvider,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmTokenLimits
} from "../llm/index.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm, type AutomationStudioRuntimeRecoveryPorts } from "../recovery/index.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../service.ts";

/** The shape Secret Keys mints its ids in: `secret:` and a UUID. */
const KEY_ID = `secret:${randomUUID()}`;
const PROJECT_ID = "project.web";
const FLOW_ID = "flow.checkout";
const ACTOR = { actorUserId: "user.lab", actorSessionId: "session.lab" };
const INSPECT_TOOL_ID = "web.inspect_current_page";
const TARGET_NOT_FOUND = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } as const;
/** The web domain's declared keys, as `createWebAutomationLlmEvidenceRuntime` declares them. */
const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"];

/** The two per-call limits the live runs reproduced with. */
const LIVE_TOKEN_LIMITS: Record<string, AutomationStudioLlmTokenLimits> = {
  default: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
  production: { maxInputTokens: 42_000, maxOutputTokens: 8_000, maxTotalTokens: 50_000 }
};

describe("the real DeepSeek adapter on a real runtime recovery", () => {
  it("accepts the secret reference the grant path hands it", () => {
    expect(() => createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: KEY_ID },
      resolveSecret: async () => "unused"
    })).not.toThrow();
  });

  // The live failure. A web failure record on the failed attempt reached the
  // packet as `failureCategory`, and the adapter's own list of what a recent
  // action may carry had never heard of it, so it refused the whole request
  // as an invalid contract before resolving the credential.
  for (const [name, tokenLimits] of Object.entries(LIVE_TOKEN_LIMITS)) {
    it(`sends the diagnosis of a target-not-found web failure under the ${name} grant limits`, async () => {
      const run = await recover({ tokenLimits, explore: false, patch: false });

      expect(run.sent.map((call) => call.taskKind)).toEqual(["runtime_diagnosis"]);
      expect(run.sent[0]?.url).toBe("https://api.deepseek.com/chat/completions");
      expect(run.sent[0]?.recentActions).toContainEqual(expect.objectContaining({ nodeId: "node.place-order", failureCategory: "target_not_found" }));
      expect(run.revealed).toEqual([KEY_ID]);
      expect(providerCalls(run.detail)).toEqual([
        expect.objectContaining({ taskKind: "runtime_diagnosis", stage: "gather", validation: { ok: true, issueCodes: [] } })
      ]);
    });
  }

  // Every kind a recovery asks for, built the way the runtime builds it, into
  // the same adapter: the diagnosis, a long exploration, and the patch.
  it("sends every recovery call kind -- diagnosis, exploration decisions past the old sixteen, and the patch", async () => {
    const run = await recover({ tokenLimits: LIVE_TOKEN_LIMITS.production!, explore: true, patch: true, looks: 18 });

    expect(run.sent.map((call) => call.taskKind)).toEqual([
      "runtime_diagnosis",
      ...Array.from({ length: 19 }, () => "evidence_tool_decision"),
      "runtime_patch"
    ]);
    expect(run.sent.filter((call) => call.taskKind === "evidence_tool_decision").map((call) => call.iteration)).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
    const calls = providerCalls(run.detail);
    expect(calls).toHaveLength(21);
    for (const call of calls) expect(call).toMatchObject({ validation: { ok: true, issueCodes: [] } });
    expect(explorationStage(run.detail)).toMatchObject({ status: "completed", detail: { outcome: "evidence_gathered", observedActions: 18 } });
  });

  // L4's live runs found the gate's account of what the run may lastingly do
  // reached the diagnosis and never an exploration decision: the adapter
  // projected a decision's context down to its instructions and its loop. The
  // explorer is the one deciding whether to press, so it is told too.
  it("shows every exploration decision what the run may lastingly do, and what becomes of anything else", async () => {
    const run = await recover({ tokenLimits: LIVE_TOKEN_LIMITS.production!, explore: true, patch: true, looks: 2 });

    const decisions = run.sent.filter((call) => call.taskKind === "evidence_tool_decision");
    expect(decisions).toHaveLength(3);
    for (const decision of decisions) {
      expect(decision.policyGates).toMatchObject({ actionPermissions: { permitted: [], granted: [], instructed: [], otherwise: expect.stringContaining("asks the person for permission") } });
      expect(decision.policyGates).not.toHaveProperty("allowExternalSideEffects");
    }
  });

  // One bad answer used to end the whole recovery: the grant was revoked on
  // the first failed call, so every later call -- the patch included -- was
  // refused as "grant unavailable". A bad answer is now a spent call. The grant
  // carries on, the exploration asks again, the progress guard stops a loop
  // whose answers stay bad, and the patch is still sent under the same grant.
  it.each([
    ["come back malformed", "malformed", "llm.provider_malformed_response", undefined],
    ["run past the call's deadline", "hang", "llm.provider_timeout", 1_000]
  ] as const)("keeps the grant through exploration decisions that %s, stops them on the progress guard, and still sends the patch", async (_label, decisionReply, code, timeoutMs) => {
    const run = await recover({ tokenLimits: LIVE_TOKEN_LIMITS.default!, explore: true, patch: true, looks: 18, decisionReply, ...(timeoutMs ? { timeoutMs } : {}) });

    expect(run.sent.map((call) => call.taskKind)).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    // The same iteration asked three times: each unusable answer was asked again.
    expect(run.sent.filter((call) => call.taskKind === "evidence_tool_decision").map((call) => call.iteration)).toEqual([1, 1, 1]);
    expect(run.revealed).toHaveLength(5);
    expect(providerCalls(run.detail).map((call) => call.validation)).toEqual([
      { ok: true, issueCodes: [] },
      { ok: false, issueCodes: [code] },
      { ok: false, issueCodes: [code] },
      { ok: false, issueCodes: [code] },
      { ok: true, issueCodes: [] }
    ]);
    expect(explorationStage(run.detail)).toMatchObject({
      status: "failed",
      detail: { outcome: "no_progress", stopReason: "no_progress", noProgressReason: "unusable_decision", unusableDecisions: 3 }
    });
    expect(run.detail.interventions.find((intervention) => intervention.kind === "runtime_patch")).toMatchObject({ validation: { ok: true } });
  }, 30_000);
});

type RecoveryOptions = {
  tokenLimits: AutomationStudioLlmTokenLimits;
  /** Whether the diagnosis asks for an exploration. */
  explore: boolean;
  /** Whether the diagnosis asks for a patch. */
  patch: boolean;
  /** How many looks the model takes before it completes the exploration. */
  looks?: number;
  /** How every exploration decision is answered instead: a malformed body, or never. */
  decisionReply?: "malformed" | "hang";
  /** The grant's per-call timeout. */
  timeoutMs?: number;
};

type SentCall = { url: string; taskKind: string; iteration?: number; recentActions?: JsonObject[]; policyGates?: JsonObject };

type Recovery = { detail: AutomationStudioFlowRunDetail; sent: SentCall[]; revealed: string[] };

/** One failed web run, recovered under a real grant through the real adapter. */
async function recover(options: RecoveryOptions): Promise<Recovery> {
  const sent: SentCall[] = [];
  const revealed: string[] = [];
  const grants = grantService(deepSeekEndpoint(options, sent), revealed);
  const grant = await grants.issue({
    ...ACTOR,
    keyId: KEY_ID,
    projectId: PROJECT_ID,
    flowId: FLOW_ID,
    provider: "deepseek",
    model: "deepseek-chat",
    purpose: "diagnose_and_adapt",
    maxCalls: 26,
    // The live run's 600,000, or every call's worst case when that is less.
    maxTotalTokensPerRun: Math.min(600_000, options.tokenLimits.maxTotalTokens * 26),
    highTokenConfirmation: true,
    tokenLimits: options.tokenLimits,
    timeoutMs: options.timeoutMs ?? 25_000,
    maxEstimatedCostUsd: 0.25,
    maxTotalEstimatedCostUsd: 2
  });
  const executionGrant = { grantId: grant.grantId, ...ACTOR, purpose: "diagnose_and_adapt" as const };
  // As `programs/_shared/runtime.ts` binds it: the grant, narrowed to the kinds
  // a runtime session may spend it on.
  const ports: AutomationStudioRuntimeRecoveryPorts = {
    resolveLlmProvider: (input) => grants.resolve(
      { ...executionGrant, projectId: input.projectId, flowId: input.flowId },
      { allowedTaskKinds: automationStudioRuntimeSessionGrantTaskKinds("diagnose_and_adapt") }
    ),
    llmEvidenceRuntime: webBinding(),
    reusableLlmContextEnabled: false,
    flowInstructionSet: async () => [],
    reusableLlmContextForFreshEvidence: async () => undefined,
    flowForRecovery: async () => ({ scope: { kind: "domain", domainId: "web-automation" } }),
    saveFlowChangeProposal: async (proposal) => proposal,
    saveFlowAdaptation: async (adaptation) => adaptation,
    promoteRuntimeAdaptation: async (input) => input.adaptation
  };
  try {
    const detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
      ports,
      detail: failedRun(),
      context: automationStudioRuntimeAdaptationContextForGrant(adaptationContext(), "diagnose_and_adapt"),
      runtimeFlow: runtimeFlow(),
      failedTraceAttempt: failedTraceAttempt(),
      executionGrant
    });
    return { detail, sent, revealed };
  } finally {
    grants.close();
  }
}

function providerCalls(detail: AutomationStudioFlowRunDetail): JsonObject[] {
  return ((detail.metadata?.llmGate as { providerCalls?: JsonObject[] } | undefined)?.providerCalls ?? []);
}

function explorationStage(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const trace = detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined;
  return trace?.stages?.find((stage) => stage.stage === "exploration");
}

/** The grant service with Identity Access and Secret Keys stood in. */
function grantService(fetchImpl: typeof fetch, revealed: string[]): AutomationStudioLlmExecutionGrantService {
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
    resolveExecutionDigest: async () => ({ executionDigest: "digest.checkout", settingsRevision: 3 }),
    fetchImpl
  });
}

/** DeepSeek's endpoint, answering each task the way a cooperative model would. */
function deepSeekEndpoint(options: RecoveryOptions, sent: SentCall[]): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const user = JSON.parse(body.messages.find((message) => message.role === "user")?.content ?? "{}") as {
      taskKind: string;
      context: { recentActions?: JsonObject[]; evidenceLoop?: { iteration: number }; policyGates?: JsonObject };
    };
    const iteration = user.context.evidenceLoop?.iteration;
    sent.push({ url: String(url), taskKind: user.taskKind, ...(iteration !== undefined ? { iteration } : {}), ...(user.context.recentActions ? { recentActions: user.context.recentActions } : {}), ...(user.context.policyGates ? { policyGates: user.context.policyGates } : {}) });
    if (user.taskKind === "evidence_tool_decision" && options.decisionReply === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The request was aborted.", "AbortError")), { once: true });
      });
    }
    const content = user.taskKind === "evidence_tool_decision" && options.decisionReply === "malformed"
      ? "{\"kind\":\"evidence_tool_decision\",\"summary\":"
      : JSON.stringify(answer(options, user.taskKind, iteration));
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 1_200, completion_tokens: 150, total_tokens: 1_350 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function answer(options: RecoveryOptions, taskKind: string, iteration: number | undefined): JsonObject {
  if (taskKind === "runtime_diagnosis") {
    return {
      kind: "diagnosis",
      summary: "The Place order button is no longer where the Flow recorded it.",
      diagnosis: { observed: "No element matched the recorded target.", stillAchievable: "yes", explorationNeeded: options.explore, patchNeeded: options.patch }
    };
  }
  if (taskKind === "evidence_tool_decision") {
    const decision = (iteration ?? 0) <= (options.looks ?? 0)
      ? { kind: "tool_call", callId: `call.${iteration}`, toolId: INSPECT_TOOL_ID, input: { region: `region.${iteration}` } }
      : { kind: "complete", result: { findings: "The Place order button moved into the order summary." } };
    return { kind: "evidence_tool_decision", summary: "Looking for the Place order button.", decision };
  }
  if (taskKind === "runtime_patch") {
    return {
      kind: "runtime_patch",
      summary: "Point the click at the Place order button the page now shows.",
      riskLevel: "low",
      patches: [{ kind: "temporary_target_override", targetNodeId: "node.place-order", target: { handles: { element: "target.2" } }, reason: "The button moved." }]
    };
  }
  throw new Error(`The stub endpoint was asked for ${taskKind}.`);
}

/** The web domain's binding, reduced to what a recovery reaches: its denied keys, its failure packet and one observing option. */
function webBinding(): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "web-automation",
    deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
    tools: [],
    harnessOptions: webHarnessOptions(),
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
    captureSanitizedFailureEvidence: async (input) => {
      const evidence = webPagePacket(input.maxEvidenceBytes, "Place order");
      return evidence;
    }
  };
}

function webHarnessOptions(): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    domainId: "web-automation",
    options: [{
      toolId: INSPECT_TOOL_ID,
      description: "Capture sanitized evidence from the current page without changing it.",
      inputSchema: { type: "object", additionalProperties: false, properties: { region: { type: "string", maxLength: 40 } } },
      effect: "observe",
      availability: { kind: "domain", domainId: "web-automation" },
      safety: { sideEffect: "observe" },
      stages: ["gather", "iterate"]
    }],
    implementations: {
      [INSPECT_TOOL_ID]: async (input) => ({
        kind: "llm_evidence_tool_execution",
        // Larger than a failure packet may be, as the live run's inspections were.
        evidence: webPagePacket(3_400, String(input.value.region ?? "page")),
        effectApplied: false,
        resultCode: "web.inspect.succeeded"
      })
    }
  };
}

/**
 * A sanitized page packet in the web domain's shape: where the page is, what
 * it holds, and the opaque handles a repair may name. Filled toward
 * `maxBytes` so the request is as large as the live one.
 */
function webPagePacket(maxBytes: number, label: string): JsonObject {
  const packet = (count: number): JsonObject => ({
    schemaVersion: "web-llm-evidence.v2",
    location: "https://shop.example.test/checkout",
    title: "Checkout",
    truncated: true,
    frame: { isTop: true },
    elementTotal: 58,
    failedAction: { nodeId: "node.place-order", definitionId: "web.output.dom-click", repairableParameters: ["element"] },
    elements: Array.from({ length: count }, (_, index) => ({
      handle: `target.${index + 1}`,
      tagName: index % 3 === 1 ? "button" : "a",
      role: index % 3 === 1 ? "button" : "link",
      visibleText: index === 1 ? "Place order" : `${label} link ${index + 1}`,
      landmark: index < 4 ? "main" : "navigation",
      visible: true
    }))
  });
  let count = 1;
  while (Buffer.byteLength(JSON.stringify(packet(count + 1)), "utf8") <= maxBytes) count += 1;
  return packet(count);
}

function failedRun(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.checkout.failed",
      flowId: FLOW_ID,
      projectId: PROJECT_ID,
      status: "failed",
      updatedAt: 5_100,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 2,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: [
      { attemptId: "node.open.attempt.1", nodeId: "node.open", definitionId: "web.output.navigate", order: 1, status: "succeeded", route: "next", startedAt: 1, finishedAt: 40, durationMs: 39 },
      {
        attemptId: "node.place-order.attempt.1",
        nodeId: "node.place-order",
        definitionId: "web.output.dom-click",
        order: 2,
        status: "failed",
        route: "failed",
        startedAt: 41,
        finishedAt: 5_041,
        durationMs: 5_000,
        message: "No element matched the recorded target.",
        failure: TARGET_NOT_FOUND
      }
    ],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}

function failedTraceAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "node.place-order.attempt.1",
    nodeId: "node.place-order",
    definitionId: "web.output.dom-click",
    startedAt: 41,
    finishedAt: 5_041,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "No element matched the recorded target.",
    failure: TARGET_NOT_FOUND
  };
}

function runtimeFlow(): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: FLOW_ID, ownerKind: "policy", ownerId: PROJECT_ID, name: "Checkout", nodes: [], edges: [], createdAt: 1, updatedAt: 1 };
}

function adaptationContext(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: PROJECT_ID,
    flowId: FLOW_ID,
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "manual",
      allowPromotion: false,
      budgets: { exhaustedBehavior: "stop" }
    },
    policy: adaptationPolicy(),
    behavior: { invokeLlm: true, runRecovery: true, createAdaptations: false, proposalApprovalMode: "manual", promoteAdaptations: false },
    metrics: {
      deterministicSuccessRuns: 0,
      llmInterventionsPerRun: 0,
      unresolvedFailures: 1,
      repeatedTriggers: [],
      acceptedAdaptations: 0,
      rejectedAdaptations: 0,
      stabilityScore: 0.5
    },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
    diagnostics: []
  };
}

function adaptationPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.checkout",
    scope: { kind: "flow", flowId: FLOW_ID },
    preset: "adaptive",
    proposalMode: "manual",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: false,
    allowCreateSubflows: false,
    allowModifyRouter: false,
    allowModifyExpectations: false,
    allowModifyActionTargets: false,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}
