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

import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withProgramAuthSession } from "../../../../../lib/program-route";
import type { ApiResponse, JsonObject } from "../../../../programs/program-api";
import type { ProgramCommandTransport } from "../../../data/program-transport";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramEndpointClassification } from "../../../../../../../../packages/fluxiq/src/programs/_shared/api.ts";
import { registerAutomationStudioApi } from "../../../../../../../../packages/fluxiq/src/programs/automation-studio/api/handlers/index.ts";
import { AutomationStudioNativeNodeRuntime, AutomationStudioService } from "../../../../../../../../packages/fluxiq/src/programs/automation-studio/runtime/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../../../../../packages/fluxiq/src/programs/automation-studio/nodes/index.ts";

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
    /** A built Flow: it has a Router, a primary part and two more. */
    flowId: string;
    /**
     * A blank Flow with an instruction and a model key, which is the only kind
     * Core builds from an instruction ("Flow Bootstrap requires a Flow without
     * a Router.").
     */
    blankFlowId: string;
    /** A part of `flowId` that nothing routes to, so it can be deleted. */
    subflowId: string;
    runId: string;
    recordingId: string;
    adaptationId: string;
    routeId: string;
    trustedClientId: string;
    version: string;
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

/**
 * The node registry a build draws on: Core's built-in control nodes, plus one
 * executable domain node, which is the least Core's readiness check accepts
 * ("Flow bootstrap generation runtime is unavailable." otherwise).
 */
function buildNodeRuntime(): AutomationStudioNativeNodeRuntime {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "contract.action",
    version: "1.0.0",
    label: "Contract action",
    description: "Do one deterministic thing.",
    category: "action",
    source: { kind: "importer", domainId: "contract", packageId: "contract.package", implementationKey: "action" },
    availability: { kind: "domain", domainId: "contract" },
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: []
  };
  return new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "contract.package", packageVersion: "1.0.0", domainId: "contract", nodes: [action] },
    { packageId: "contract.package", packageVersion: "1.0.0", implementations: { action: () => ({ status: "success", route: "success", outputs: { success: true } }) } }
  );
}

/**
 * The model, scripted: every call answers with the smallest Flow Core accepts,
 * Start to End. The contract under test is the request the capability sends,
 * not what a model makes of it, so a real provider would only add a network.
 */
const SCRIPTED_MODEL = {
  provider: {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    runTask: async () => ({
      response: {
        kind: "flow_bootstrap",
        summary: "Start, then end.",
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
            edges: [{ key: "start_end", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "end", portId: "in" } }]
          }]
        }
      },
      usage: { inputTokens: 900, outputTokens: 100, totalTokens: 1000, estimatedCostUsd: 0.001 }
    })
  },
  tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 512, maxTotalTokens: 9_000 },
  maxCallsPerRun: 1,
  maxEstimatedCostUsd: 0.25,
  timeoutMs: 20_000
};

type ContractSeed = { rootDir: string; ids: ContractWorld["ids"] };

// The seeded data is built once per test file and copied into each world. A
// world used to seed its own -- fifteen Core operations on a fresh project --
// for every one of about eighty variants. That was most of the file's 440-629 s,
// and on a loaded machine it pushed single variants past their timeout. Each
// world still gets its own copy and its own service, so no variant sees
// another's writes.
let seeding: Promise<ContractSeed> | undefined;

function contractService(dataDir: string): AutomationStudioService {
  return new AutomationStudioService({
    dataDir,
    seedFixture: false,
    llmProviderResolver: async () => SCRIPTED_MODEL as never
  }).bindNativeNodeRuntime(buildNodeRuntime());
}

const identityAccess = {
  authorizeSessionPin: async (input: { sessionId?: string; pin?: string }) => {
    if (input.sessionId !== SESSION_ID || input.pin !== CONTRACT_PIN) throw new Error("The PIN was not accepted.");
    return { authorized: true };
  }
};

/** Core's registry with the Automation Studio API registered on `service`, and each endpoint's classification. */
function contractRegistry(service: AutomationStudioService, clientGateway: unknown) {
  const registry = new GlobalProgramApiRegistry({ identityAccess: identityAccess as never });
  registerAutomationStudioApi(registry, service, identityAccess as never, undefined, clientGateway as never);
  const endpoints = registry.endpoints().filter((entry) => entry.programId === "automation-studio");
  const classifications = new Map(endpoints.map((entry) => [entry.endpoint, entry.classification]));
  return { registry, endpoints, classifications };
}

/**
 * Core's classification of every Automation Studio endpoint. Registering the
 * handlers reads no data, so this needs no seeded world. It used to open one,
 * and on a loaded machine the seeding alone outran the five-second timeout.
 */
export async function contractClassifications(): Promise<ReadonlyMap<string, ProgramEndpointClassification>> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-capability-classes-"));
  const service = contractService(path.join(rootDir, ".fluxiq", "data"));
  try {
    return contractRegistry(service, { revokeTrustedClient: async () => false }).classifications;
  } finally {
    await service.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}

async function seedContractData(): Promise<ContractSeed> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-capability-contract-seed-"));
  const service = contractService(path.join(rootDir, ".fluxiq", "data"));
  try {
    const project = await service.createProject({ name: "Contract project" });
    const created = await service.createFlow({ projectId: project.id, name: "Contract Flow" });
    // A Flow with a model key chosen in its settings, as the panel's own build
    // button requires before it offers a build.
    const withModelKey = <T extends { metadata?: unknown }>(flow: T) => ({ ...flow, metadata: { ...((flow.metadata as Record<string, unknown> | undefined) ?? {}), llmProvider: "deepseek", llmModel: "deepseek-flash", llmSecretKeyId: LLM_KEY_ID } });
    await service.saveFlow({ projectId: project.id, flow: withModelKey(created) as never });
    const flow = created;
    const primary = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Checkout" });
    // The seeded branch goes to a third part, not to `subflow`: Core will not
    // delete a part a branch still reaches ("Remove this Subflow from Router
    // routes and fallback before deleting it."), and `subflow.delete` deletes
    // `subflow`.
    const routed = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "In stock" });
    const route = await service.upsertFlowMapRoute({ projectId: project.id, flowId: flow.flowId, name: "When it is in stock", targetSubflowId: routed.subflowId });
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
    // The blank Flow a build starts from, as the panel's build button needs
    // it: a model key chosen, and an instruction saying what to build.
    const blankCreated = await service.createFlow({ projectId: project.id, name: "Contract blank Flow" });
    await service.saveFlow({ projectId: project.id, flow: withModelKey(blankCreated) as never });
    await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: blankCreated.flowId, instruction: "Create a deterministic Start to End Flow." });
    await service.close();
    return {
      rootDir,
      ids: {
        projectId: project.id,
        flowId: flow.flowId,
        blankFlowId: blankCreated.flowId,
        subflowId: subflow.subflowId,
        runId: run.runId,
        recordingId: recording.recordingId,
        adaptationId: adaptation.adaptationId,
        routeId,
        trustedClientId: TRUSTED_CLIENT_ID,
        version
      }
    };
  } catch (error) {
    await service.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
    throw error;
  }
}

/** Removes the seeded data the worlds were copied from. Call it once, after every world has closed. */
export async function closeContractSeed(): Promise<void> {
  const seed = await seeding?.catch(() => undefined);
  seeding = undefined;
  if (seed) await rm(seed.rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
}

export async function openContractWorld(): Promise<ContractWorld> {
  seeding ??= seedContractData();
  const seed = await seeding;
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-capability-contract-"));
  await cp(seed.rootDir, rootDir, { recursive: true });
  const service = contractService(path.join(rootDir, ".fluxiq", "data"));
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
  const { registry, endpoints, classifications } = contractRegistry(service, clientGateway);
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
    await service.close();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  };
  return { service, transport, exchanges, classifications, ids: { ...seed.ids }, close };
}
