// A real FluxIQ Core, for proving that what a capability sends is what Core
// reads.
//
// The service is Core's own `AutomationStudioService` on a temporary data
// directory, and the endpoints are Core's own handlers registered on Core's own
// `GlobalProgramApiRegistry`, imported from Core's source rather than its built
// `dist`, so a handler changed this morning is the handler under test. The
// transport between them does exactly what the web route does to a request:
// the payload crosses as JSON, and the person's auth session is added by the
// same `withProgramAuthSession` the route calls.
//
// Every read the handler makes of the payload is recorded, down to nested
// fields, so a field the capability sends and Core never looks at shows up as
// a field Core dropped rather than as a success.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withProgramAuthSession } from "../../../../../lib/program-route";
import type { ApiResponse, JsonObject } from "../../../../programs/program-api";
import type { ProgramCommandTransport } from "../../../data/program-transport";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramEndpointClassification } from "../../../../../../../../packages/fluxiq/src/programs/_shared/api.ts";
import { registerAutomationStudioApi } from "../../../../../../../../packages/fluxiq/src/programs/automation-studio/api/handlers/index.ts";
import { AutomationStudioLlmExecutionGrantService, AutomationStudioService } from "../../../../../../../../packages/fluxiq/src/programs/automation-studio/runtime/index.ts";

export const CONTRACT_PIN = "482915";
const SESSION_ID = "session.contract";

/** One request that reached Core, and what Core made of it. */
export type ContractExchange = {
  endpoint: string;
  /** The payload as it crossed the wire, before the route added the session. */
  sent: Record<string, unknown> | undefined;
  /** Every payload path the handler, the registry or the service read. */
  reads: Set<string>;
  response: { ok: boolean; payload?: unknown; error?: string; errorCode?: string };
};

export type ContractWorld = {
  service: AutomationStudioService;
  transport: ProgramCommandTransport;
  exchanges: ContractExchange[];
  /** Core's classification of every endpoint it registered. */
  classifications: ReadonlyMap<string, ProgramEndpointClassification>;
  ids: {
    projectId: string;
    flowId: string;
    subflowId: string;
    runId: string;
    recordingId: string;
    adaptationId: string;
    routeId: string;
    trustedClientId: string;
    version: string;
    llmExecutionGrantId: string;
  };
  close(): Promise<void>;
};

/** Wraps a payload so every property read is recorded by path. Arrays record `path[]`. */
function traced(value: unknown, at: string, reads: Set<string>): unknown {
  if (!value || typeof value !== "object") return value;
  return new Proxy(value as object, {
    get(target, key, receiver) {
      const found = Reflect.get(target, key, receiver);
      if (typeof key !== "string") return found;
      if (Array.isArray(target) && (key === "length" || /^\d+$/u.test(key))) {
        const child = `${at}[]`;
        reads.add(child);
        return key === "length" ? found : traced(found, child, reads);
      }
      if (Array.isArray(target) || !Object.prototype.hasOwnProperty.call(target, key)) return found;
      const child = at ? `${at}.${key}` : key;
      reads.add(child);
      return traced(found, child, reads);
    }
  });
}

const TRUSTED_CLIENT_ID = "client.contract";
const LLM_KEY_ID = "secret:contract";

export async function openContractWorld(): Promise<ContractWorld> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-capability-contract-"));
  const service = new AutomationStudioService({ dataDir: path.join(rootDir, ".fluxiq", "data"), seedFixture: false });
  const identityAccess = {
    authorizeSessionPin: async (input: { sessionId?: string; pin?: string }) => {
      if (input.sessionId !== SESSION_ID || input.pin !== CONTRACT_PIN) throw new Error("The PIN was not accepted.");
      return { authorized: true };
    }
  };
  // The client gateway is the one collaborator faked: a paired browser cannot
  // be conjured in a test, and revoking one needs nothing but its id.
  const revoked = new Set<string>();
  const clientGateway = {
    revokeTrustedClient: async (trustedClientId: string) => {
      if (trustedClientId !== TRUSTED_CLIENT_ID || revoked.has(trustedClientId)) return false;
      revoked.add(trustedClientId);
      return true;
    }
  };
  // Core's real grant service. Only its Secret Keys port is faked, holding one
  // enabled DeepSeek key, which is what a person who can build a Flow has.
  const key = { id: LLM_KEY_ID, name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", scopeRef: null, enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };
  let reveals = 0;
  const llmExecutionGrants = new AutomationStudioLlmExecutionGrantService({
    identityAccess: { validateSession: async () => ({ user: { id: "user.contract" }, session: {}, role: {} }) } as never,
    secretKeys: {
      getKeySummary: async (keyId: string) => (keyId === LLM_KEY_ID ? { ...key } : null),
      createSessionRevealAuthorization: async () => ({ authorizationId: `secret-reveal:${++reveals}`, keyId: LLM_KEY_ID, keyUpdatedAtMs: 1, expiresAtMs: Date.now() + 60_000, remainingUses: 1 }),
      revokeRevealAuthorization: () => undefined
    } as never,
    resolveExecutionDigest: async (projectId, flowId) => service.getLlmExecutionBinding(projectId, flowId)
  });
  const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccess as never });
  registerAutomationStudioApi(registry, service, identityAccess as never, undefined, clientGateway as never, llmExecutionGrants);
  const endpoints = registry.endpoints().filter((entry) => entry.programId === "automation-studio");
  const classifications = new Map(endpoints.map((entry) => [entry.endpoint, entry.classification]));
  const actor: ProgramApiActor = {
    sessionId: SESSION_ID,
    userId: "user.contract",
    roleId: "admin",
    permissions: [...new Set(endpoints.map((entry) => entry.permission))]
  };

  const exchanges: ContractExchange[] = [];
  const call = async <T>(endpoint: string, payload: JsonObject | undefined): Promise<ApiResponse<T>> => {
    const sent = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const reads = new Set<string>();
    const routed = sent === undefined ? undefined : withProgramAuthSession("automation-studio", sent, SESSION_ID);
    const response = await registry.call({ programId: "automation-studio", endpoint, scope: {}, actor, payload: traced(routed, "", reads) });
    exchanges.push({ endpoint, sent, reads, response });
    const wire = JSON.parse(JSON.stringify(response)) as typeof response;
    return wire.ok
      ? { ok: true, status: 200, ...(wire.payload === undefined ? {} : { payload: wire.payload as T }) }
      : { ok: false, status: 400, retryable: false, error: wire.error ?? "Refused.", ...(wire.errorCode ? { code: wire.errorCode } : {}) };
  };
  const transport: ProgramCommandTransport = {
    get: (endpoint) => call(endpoint, undefined),
    post: (endpoint, payload) => call(endpoint, payload)
  };

  const close = async () => {
    llmExecutionGrants.close();
    await service.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  };
  try {
    const project = await service.createProject({ name: "Contract project" });
    const created = await service.createFlow({ projectId: project.id, name: "Contract Flow" });
    // A Flow with a model key chosen in its settings, as the panel's own build
    // button requires before it will ask for a grant.
    await service.saveFlow({ projectId: project.id, flow: { ...created, metadata: { ...(created.metadata ?? {}), llmProvider: "deepseek", llmModel: "deepseek-flash", llmSecretKeyId: LLM_KEY_ID } } });
    const flow = created;
    const primary = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Checkout" });
    const route = await service.upsertFlowMapRoute({ projectId: project.id, flowId: flow.flowId, name: "When it is in stock", targetSubflowId: subflow.subflowId });
    const routeId = route.rules.find((entry) => entry.name === "When it is in stock")?.ruleId;
    if (!routeId) throw new Error("The seeded route did not come back from Core.");
    const run = await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.contract", initialState: { timestamp: 1, namespaces: {} } });
    const adaptation = await service.saveFlowAdaptation({
      schemaVersion: "0.1",
      adaptationId: "adaptation.contract",
      flowId: flow.flowId,
      subflowId: primary.subflowId,
      projectId: project.id,
      trigger: "Expected state changed",
      patch: [{ kind: "edit_expectation", targetId: "expect.ready", summary: "Wait for the price to load.", after: { timeoutMs: 500, retryCount: 3 } }],
      validationResults: [],
      author: "runtime",
      riskLevel: "low",
      status: "proposed",
      createdAt: 10,
      updatedAt: 10
    });
    const version = "1.0.0";
    await service.publishFlow({ projectId: project.id, flowId: flow.flowId, version, publishedBy: "contract" });
    // A build grant, issued by Core's grant service to this person's session,
    // as the panel's own build button issues one.
    const grant = await llmExecutionGrants.issue({
      actorUserId: actor.userId,
      actorSessionId: SESSION_ID,
      keyId: LLM_KEY_ID,
      projectId: project.id,
      flowId: flow.flowId,
      provider: "deepseek",
      model: "deepseek-flash",
      purpose: "build_and_adapt",
      maxCalls: 1,
      maxUses: 1
    } as Parameters<AutomationStudioLlmExecutionGrantService["issue"]>[0]);
    return {
      service,
      transport,
      exchanges,
      classifications,
      ids: {
        projectId: project.id,
        flowId: flow.flowId,
        subflowId: subflow.subflowId,
        runId: run.runId,
        recordingId: recording.recordingId,
        adaptationId: adaptation.adaptationId,
        routeId,
        trustedClientId: TRUSTED_CLIENT_ID,
        version,
        llmExecutionGrantId: grant.grantId
      },
      close
    };
  } catch (error) {
    await close();
    throw error;
  }
}
