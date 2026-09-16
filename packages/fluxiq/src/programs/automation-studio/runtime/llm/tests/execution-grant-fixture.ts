// The grant service under test, with stand-ins for Identity Access, Secret
// Keys and the DeepSeek endpoint that record what the grant asked of them.
// The Secret Keys stand-in behaves as the real service does where the grant
// relies on it: an authorization is one-use, and refused once revoked or
// expired. Shared by the grant tests, which no longer fit in one file.

import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import { AutomationStudioLlmExecutionGrantService } from "../execution-grants.ts";

export function setupExecutionGrantFixture() {
  const key: any = { id: "secret:key", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "flow", scopeRef: "flow.one", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-chat" } };
  let now = 1;
  let sessionValid = true;
  let pinConfigured = true;
  let executionDigest = "execution-digest.one";
  let settingsRevision = 7;
  let exactBinding = false;
  let revealAuthorizationCount = 0;
  let revealCount = 0;
  let revokeAuthorizationCount = 0;
  const revokedAuthorizationIds: string[] = [];
  const revealedAuthorizationIds: string[] = [];
  // Authorization id to its expiry, for as long as Secret Keys would hold it.
  const liveAuthorizations = new Map<string, number>();
  // Whether the actor's Secret Keys session unlock can still mint an authorization.
  let sessionUnlocked = true;
  let delayMint = false;
  let mintStarted = Promise.resolve();
  let startMint = () => {};
  let releaseMint = () => {};
  let mintWait = Promise.resolve();
  // What each provider reply reports using.
  let usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
  // Provider replies, in order, for a test that scripts a whole conversation.
  const script: unknown[] = [];
  let delayReveal = false;
  let releaseReveal = () => {};
  let startReveal = () => {};
  let revealWait = Promise.resolve();
  let revealStarted = Promise.resolve();
  let delayProvider = false;
  let releaseProvider = () => {};
  let startProvider = () => {};
  let providerWait = Promise.resolve();
  let providerStarted = Promise.resolve();
  const resetProviderGate = () => {
    providerStarted = new Promise<void>((resolve) => { startProvider = resolve; });
    providerWait = new Promise<void>((resolve) => { releaseProvider = resolve; });
  };
  const resetRevealGate = () => {
    revealStarted = new Promise<void>((resolve) => { startReveal = resolve; });
    revealWait = new Promise<void>((resolve) => { releaseReveal = resolve; });
  };
  const fixture: any = {
    key,
    get now() { return now; },
    set now(value: number) { now = value; },
    get sessionValid() { return sessionValid; },
    set sessionValid(value: boolean) { sessionValid = value; },
    get pinConfigured() { return pinConfigured; },
    set pinConfigured(value: boolean) { pinConfigured = value; },
    get executionDigest() { return executionDigest; },
    set executionDigest(value: string) { executionDigest = value; },
    get settingsRevision() { return settingsRevision; },
    set settingsRevision(value: number) { settingsRevision = value; },
    get exactBinding() { return exactBinding; },
    set exactBinding(value: boolean) { exactBinding = value; },
    get revealAuthorizationCount() { return revealAuthorizationCount; },
    get revealCount() { return revealCount; },
    get revokeAuthorizationCount() { return revokeAuthorizationCount; },
    revokedAuthorizationIds,
    revealedAuthorizationIds,
    get sessionUnlocked() { return sessionUnlocked; },
    set sessionUnlocked(value: boolean) { sessionUnlocked = value; },
    get delayMint() { return delayMint; },
    set delayMint(value: boolean) {
      delayMint = value;
      if (value) {
        mintStarted = new Promise<void>((resolve) => { startMint = resolve; });
        mintWait = new Promise<void>((resolve) => { releaseMint = resolve; });
      }
    },
    get mintStarted() { return mintStarted; },
    releaseMint: () => releaseMint(),
    get usage() { return usage; },
    set usage(value: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) { usage = value; },
    script,
    get delayReveal() { return delayReveal; },
    set delayReveal(value: boolean) {
      delayReveal = value;
      if (value) resetRevealGate();
    },
    get revealStarted() { return revealStarted; },
    releaseReveal: () => releaseReveal(),
    get delayProvider() { return delayProvider; },
    set delayProvider(value: boolean) {
      delayProvider = value;
      if (value) resetProviderGate();
    },
    get providerStarted() { return providerStarted; },
    releaseProvider: () => releaseProvider()
  };
  fixture.service = new AutomationStudioLlmExecutionGrantService({
    now: () => now,
    resolveExecutionDigest: async (_projectId: string, flowId: string) => {
      if (flowId !== "flow.one") throw new Error("Unknown Flow");
      return exactBinding ? { executionDigest, settingsRevision } : executionDigest;
    },
    identityAccess: {
      validateSession: async () => sessionValid ? { user: { id: "user.one", passwordConfigured: true, pinConfigured }, session: {}, role: {} } : null
    } as any,
    secretKeys: {
      getKeySummary: async () => ({ ...key }),
      createSessionRevealAuthorization: async (input: { ttlMs?: number }) => {
        if (!sessionUnlocked) throw new Error("Secret key session unlock is unavailable");
        if (delayMint) {
          startMint();
          await mintWait;
        }
        revealAuthorizationCount += 1;
        const authorization = { authorizationId: `secret-reveal:${revealAuthorizationCount}`, keyId: key.id, keyUpdatedAtMs: key.updatedAtMs, expiresAtMs: now + (input.ttlMs ?? 60_000), remainingUses: 1 };
        liveAuthorizations.set(authorization.authorizationId, authorization.expiresAtMs);
        return authorization;
      },
      // As Secret Keys does: one use, and refused once revoked or expired.
      revealKeyWithAuthorization: async (input: { authorizationId: string }) => {
        const expiresAtMs = liveAuthorizations.get(input.authorizationId);
        if (expiresAtMs === undefined || expiresAtMs <= now) throw new Error("Secret reveal authorization is unavailable");
        liveAuthorizations.delete(input.authorizationId);
        revealCount += 1;
        revealedAuthorizationIds.push(input.authorizationId);
        if (delayReveal) {
          startReveal();
          await revealWait;
        }
        return { key: { ...key }, value: "test-secret" };
      },
      revokeRevealAuthorization: (authorizationId: string) => {
        liveAuthorizations.delete(authorizationId);
        revokeAuthorizationCount += 1;
        revokedAuthorizationIds.push(authorizationId);
      }
    } as any,
    fetchImpl: (async (_input: unknown, init?: RequestInit) => {
      if (delayProvider) {
        startProvider();
        await new Promise<void>((resolve, reject) => {
          const aborted = () => reject(new Error("provider aborted"));
          init?.signal?.addEventListener("abort", aborted, { once: true });
          providerWait.then(() => {
            init?.signal?.removeEventListener("abort", aborted);
            resolve();
          }, reject);
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role?: string; content?: string }> };
      const userMessage = body.messages?.find((message) => message.role === "user")?.content;
      const task = userMessage ? JSON.parse(userMessage) as { taskKind?: string } : {};
      const content = script.length ? script.shift() : task.taskKind === "runtime_patch"
        ? { kind: "runtime_patch", summary: "safe", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "node.one", target: { handles: { element: "target.1" } }, reason: "Use observed target." }] }
        : { kind: "diagnosis", summary: "safe" };
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  return fixture as {
    service: AutomationStudioLlmExecutionGrantService;
    key: any;
    now: number;
    sessionValid: boolean;
    pinConfigured: boolean;
    executionDigest: string;
    settingsRevision: number;
    exactBinding: boolean;
    revealAuthorizationCount: number;
    revealCount: number;
    revokeAuthorizationCount: number;
    revokedAuthorizationIds: string[];
    revealedAuthorizationIds: string[];
    sessionUnlocked: boolean;
    delayMint: boolean;
    mintStarted: Promise<void>;
    releaseMint: () => void;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    script: unknown[];
    delayReveal: boolean;
    revealStarted: Promise<void>;
    releaseReveal: () => void;
    delayProvider: boolean;
    providerStarted: Promise<void>;
    releaseProvider: () => void;
  };
}

export function issueInput() {
  return { actorUserId: "user.one", actorSessionId: "session.one", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", provider: "deepseek", model: "deepseek-chat" };
}
export function evidenceRequest(): AutomationStudioLlmTaskRequest {
  const base = request();
  return {
    ...base,
    requestId: "request.evidence",
    idempotencyKey: "request.evidence",
    taskKind: "evidence_tool_decision",
    expectedOutput: "evidence_tool_decision",
    context: { ...base.context, taskKind: "evidence_tool_decision" }
  };
}
/** A gather request the DeepSeek contract accepts: a real evidence-loop
 * context whose decision schema is the one Core builds for these tools. */
export function gatherRequest(iteration: number, evidence: Array<{ callId: string; toolId: string; value: { control: string } }>): AutomationStudioLlmTaskRequest {
  const base = evidenceRequest();
  const tools = [{ toolId: "inspect", description: "Look at the live form.", inputSchema: { type: "object" }, effect: "observe" as const }];
  const completionSchema = { type: "object", required: ["findings"], properties: { findings: { type: "string" } } };
  return {
    ...base,
    requestId: `request.gather.${iteration}`,
    idempotencyKey: `request.gather.${iteration}`,
    context: {
      ...base.context,
      evidenceLoop: { iteration, tools, evidence, completionSchema, canComplete: true, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true) }
    }
  };
}
export function patchRequest(): AutomationStudioLlmTaskRequest {
  const base = request();
  return { ...base, requestId: "request.patch", idempotencyKey: "request.patch", taskKind: "runtime_patch", expectedOutput: "runtime_patch", context: { ...base.context, taskKind: "runtime_patch" } };
}
export function resolveInput(grantId: string) {
  return { grantId, actorUserId: "user.one", actorSessionId: "session.one", projectId: "project.one", flowId: "flow.one", purpose: "diagnosis_only" as const };
}
export function request(): AutomationStudioLlmTaskRequest {
  return { requestId: "request.one", idempotencyKey: "request.one", timeoutMs: 20000, estimatedInputTokens: 100, maxEstimatedCostUsd: 0.25, taskKind: "runtime_diagnosis", promptVersion: "v1", expectedOutput: "diagnosis", tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, context: { schemaVersion: "0.1", taskKind: "runtime_diagnosis", promptVersion: "v1", projectId: "project.one", flowId: "flow.one", instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 } } };
}
