// A call the grant refuses names its check, and never reads as a provider fault.
//
// `run-mun5e1ie-5aeefbbd` (2026-09-29) ended its build on its first call with
// `flow_bootstrap.provider_transport_unknown`, a valid key and a working network.
// The grant wraps the provider, so a refusal on the call is thrown from inside
// `runTask`, and the provider-retry seam flattened every such throw to
// `llm.provider_request_failed`. These drive a real grant with only Identity
// Access, Secret Keys and the network stood in, and read the failure the way
// the seam does.
import { describe, expect, it } from "vitest";
import {
  AutomationStudioLlmExecutionGrantRefusal,
  AutomationStudioLlmExecutionGrantService,
  normalizedAutomationStudioLlmProviderFailure,
  type AutomationStudioLlmTaskRequest
} from "../../index.ts";

const KEY = { id: "secret:grant-call-refusal", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };
const ACTOR = { actorUserId: "user.lab", actorSessionId: "session.lab" };
const SCOPE = { projectId: "project.lab", flowId: "flow.lab" };
const LIMITS = { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 };

type World = { binding: { executionDigest: string; settingsRevision: number }; sessionValid: boolean; fetches: number };

async function grantedProvider(world: World) {
  let minted = 0;
  const secretKeys = {
    getKeySummary: async () => ({ ...KEY }),
    createSessionRevealAuthorization: async (input: { ttlMs?: number; nowMs?: number }) => {
      minted += 1;
      return { authorizationId: `secret-reveal:${minted}`, keyId: KEY.id, keyUpdatedAtMs: KEY.updatedAtMs, expiresAtMs: (input.nowMs ?? Date.now()) + (input.ttlMs ?? 60_000), remainingUses: 1 };
    },
    revealKeyWithAuthorization: async () => ({ key: { ...KEY }, value: "test-deepseek-credential" }),
    revokeRevealAuthorization: () => {}
  };
  const identityAccess = { validateSession: async () => world.sessionValid ? { user: { id: ACTOR.actorUserId }, session: {}, role: {} } : null };
  const grants = new AutomationStudioLlmExecutionGrantService({
    identityAccess: identityAccess as unknown as ConstructorParameters<typeof AutomationStudioLlmExecutionGrantService>[0]["identityAccess"],
    secretKeys: secretKeys as unknown as ConstructorParameters<typeof AutomationStudioLlmExecutionGrantService>[0]["secretKeys"],
    resolveExecutionDigest: async () => ({ ...world.binding }),
    fetchImpl: (async () => {
      world.fetches += 1;
      throw new Error("The network is not part of this test.");
    }) as typeof fetch
  });
  const grant = await grants.issue({
    ...ACTOR, ...SCOPE, keyId: KEY.id, provider: "deepseek", model: "deepseek-flash", purpose: "build_and_adapt",
    maxCalls: 4, tokenLimits: LIMITS, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2
  });
  const resolved = await grants.resolve({ grantId: grant.grantId, ...ACTOR, ...SCOPE, purpose: "build_and_adapt" });
  return { grants, provider: resolved.provider };
}

function decisionRequest(overrides: Partial<{ timeoutMs: number }> = {}): AutomationStudioLlmTaskRequest {
  return {
    requestId: "llm.evidence_tool_decision.grant-call-refusal",
    taskKind: "evidence_tool_decision",
    expectedOutput: "evidence_tool_decision",
    context: { ...SCOPE },
    timeoutMs: overrides.timeoutMs ?? 25_000,
    maxEstimatedCostUsd: 0.25,
    tokenLimits: { ...LIMITS },
    estimatedInputTokens: 14_280
  } as unknown as AutomationStudioLlmTaskRequest;
}

async function refusalOf(world: World, change: (world: World) => void, request = decisionRequest()) {
  const { grants, provider } = await grantedProvider(world);
  change(world);
  try {
    const error = await provider.runTask(request).then(() => undefined, (thrown: unknown) => thrown);
    return { error, failure: normalizedAutomationStudioLlmProviderFailure(error), activeGrants: grants.activeGrantCount() };
  } finally {
    grants.close();
  }
}

function freshWorld(): World {
  return { binding: { executionDigest: "digest.before", settingsRevision: 3 }, sessionValid: true, fetches: 0 };
}

describe("a call the grant refuses", () => {
  it("names a Flow that changed since the grant was minted, and sends nothing", async () => {
    const world = freshWorld();
    const { error, failure, activeGrants } = await refusalOf(world, (w) => { w.binding = { executionDigest: "digest.after", settingsRevision: 4 }; });
    expect(error).toBeInstanceOf(AutomationStudioLlmExecutionGrantRefusal);
    expect(error).toMatchObject({ code: "llm.execution_grant_no_longer_valid", reason: "flow_changed" });
    expect(failure).toMatchObject({
      code: "llm.execution_grant_no_longer_valid",
      retryable: false,
      grantRefusalReason: "flow_changed",
      provenance: { providerInvocation: "not_attempted", providerResponse: "not_received" }
    });
    expect(world.fetches).toBe(0);
    expect(activeGrants).toBe(0);
  });

  it("names a session that ended", async () => {
    const world = freshWorld();
    const { failure } = await refusalOf(world, (w) => { w.sessionValid = false; });
    expect(failure).toMatchObject({ code: "llm.execution_grant_no_longer_valid", grantRefusalReason: "session_invalid" });
    expect(world.fetches).toBe(0);
  });

  it("names a request that asks for more than the grant allows, where it used to be an untyped throw", async () => {
    const world = freshWorld();
    const { error, failure } = await refusalOf(world, () => {}, decisionRequest({ timeoutMs: 30_000 }));
    expect(error).toBeInstanceOf(AutomationStudioLlmExecutionGrantRefusal);
    expect(failure).toMatchObject({ code: "llm.execution_grant_scope_mismatch", grantRefusalReason: "request_exceeds_grant" });
    expect(failure.code).not.toBe("llm.provider_request_failed");
    expect(world.fetches).toBe(0);
  });
});
