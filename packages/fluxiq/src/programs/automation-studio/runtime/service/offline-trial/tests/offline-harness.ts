// Test support for offline candidate trials: a live-like candidate trial
// recorded through the real gateway tap into a test episode's trace -- a
// scripted, non-browser client paired by a person, the production executor,
// graph options, RuntimeService and client gateway -- and the same trial ports
// for the offline trial that runs on that trace. The candidate reads rows
// through one domain action and computes over them with built-in nodes.

import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  CLIENT_GATEWAY_TRACE_TAP_STREAMS,
  ClientGatewayService,
  ClientGatewayTraceMemoryStore,
  type ClientGatewayCapability,
  type ClientGatewayClientHello,
  type ClientGatewayServerMessage,
  type ClientGatewayTraceReevaluator,
  type ClientGatewayTraceStore
} from "../../../../../../client-gateway/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../../io/index.ts";
import { ClientGatewayRuntimeTransport, RuntimeService } from "../../../../../../runtime/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioChannelScope } from "../../../environment/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioRecordBatch } from "../../../executor/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { runAutomationStudioDetachedCandidate } from "../../../flow-bootstrap/verification/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapNode, type AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/plan/index.ts";
import { AutomationStudioGatewayTraceEpisodes, AutomationStudioGatewayTraceInstallation } from "../../../gateway-trace/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import type { AutomationStudioCandidateTrialPorts } from "../../candidate-trial/index.ts";
import { runAutomationStudioCandidateTrial } from "../../candidate-trial/index.ts";
import { automationStudioRunGraphOptions } from "../../runtime-session/index.ts";
import { AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS, runAutomationStudioOfflineCandidateTrial, type AutomationStudioOfflineTrialPhase } from "../index.ts";

const DOMAIN = "example";
export const READ = "example.read";
const PROJECT = "project.offline-trial";
const SPENT = Object.freeze({ inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.001, calls: 2 });

const capability: ClientGatewayCapability = { id: "example.actions", kind: "action", actionTypes: [READ], metadata: { domainId: DOMAIN } };

/** A domain read the registry declares, so a plan's policy action may name its output. */
const READ_DEFINITION: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.example.read", version: "1.0.0", label: "Read rows", description: "Reads rows of a list.", category: "action",
  source: { kind: "importer", domainId: DOMAIN, implementationKey: "example.read" }, availability: { kind: "domain", domainId: DOMAIN }, capabilities: { executable: true },
  outputAction: { fixedOutputId: READ }, inputs: [], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: [{ id: "query", label: "Query", valueType: "string" }]
};

/** The rows the scripted client's read answers with: `stock` is a field the first candidate never reads. */
export const ROWS: readonly JsonObject[] = Object.freeze([
  { name: "lamp-a", price: 5, stock: 0 },
  { name: "lamp-b", price: 12, stock: 3 },
  { name: "lamp-c", price: 20, stock: 7 }
]);

export const RECORD_OUTPUT: JsonObject = {
  datasetId: "items", label: "Items", recordsPath: "rows", writeMode: "replace",
  schema: { schemaVersion: "0.1", fields: [
    { id: "name", label: "Name", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" },
    { id: "stock", label: "Stock", valueType: "number" }
  ] }
};

/** What the candidate is: the read's query, the price threshold it keeps rows above, and an optional second computation over the kept rows. */
export type CandidateShape = { query: string; threshold: number; stockAbove?: number | undefined };

/** Start, read rows, keep the rows priced above `threshold`; with `stockAbove`, then keep the kept rows stocked above it. */
export function candidateOf(shape: CandidateShape, revision = 1): AutomationStudioFlowCandidate {
  const filter = (key: string, path: string, value: number): AutomationStudioFlowBootstrapNode => ({ key, definitionId: "builtin.data.filter-list", definitionVersion: "1.0.0", parameters: { path, operator: "greater-than", value } });
  const edge = (key: string, from: string, fromPort: string, to: string, toPort: string) => ({ key, source: { nodeKey: from, portId: fromPort }, target: { nodeKey: to, portId: toPort } });
  const nodes: AutomationStudioFlowBootstrapNode[] = [
    { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
    { key: "read", definitionId: "builtin.policy.action", definitionVersion: "1.0.0", parameters: { outputId: READ, parameters: { query: shape.query }, recordOutput: RECORD_OUTPUT }, consequences: [] },
    filter("keep", "price", shape.threshold)
  ];
  const edges = [edge("go", "start", "success", "read", "in"), edge("then", "read", "success", "keep", "in"), edge("rows", "read", "records", "keep", "items")];
  if (shape.stockAbove !== undefined) {
    nodes.push(filter("stocked", "stock", shape.stockAbove));
    edges.push(edge("next", "keep", "success", "stocked", "in"), edge("kept", "keep", "items", "stocked", "items"));
  }
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }]
  };
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan, resolution: RESOLUTION, registry: REGISTRY });
  if (!validation.validated) throw new Error(`fixture plan did not validate: ${validation.issues.map((issue) => issue.code).join(", ")}`);
  return { revision, digest: String(revision).repeat(64).slice(0, 64), baseDependencyDigest: "base", status: "draft", summary: "Read and keep rows", buildPlan: validation.validated, changedPaths: ["plan"] };
}

const REGISTRY = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, READ_DEFINITION]);
const PARENT = createBlankAutomationStudioFlowArtifact({ flowId: "flow.offline", projectId: PROJECT, name: "Offline", scope: { kind: "domain", domainId: DOMAIN }, now: 1 });
const RESOLUTION = { scope: PARENT.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };

export function requestFor(candidate: AutomationStudioFlowCandidate, signal = new AbortController().signal): AutomationStudioCandidateTrialRequest {
  return { candidateId: "candidate.offline", revision: candidate.revision, digest: candidate.digest, signal, candidate: structuredClone(candidate) };
}

/** One answer of the scripted client to a read: what it says, after how long. */
export type ReadAnswer = { delayMs: number; status: "succeeded"; payload: JsonObject } | { delayMs: number; status: "failed"; error: string; failure: JsonObject };

/** How the scripted client answers its `occurrence`-th read (from 1). */
export type ReadScript = (parameters: JsonValue | undefined, occurrence: number) => ReadAnswer;

const ANSWER_ROWS: ReadScript = () => ({ delayMs: 2, status: "succeeded", payload: { rows: structuredClone([...ROWS]) } });

export type OfflineHarness = Awaited<ReturnType<typeof offlineHarness>>;

/**
 * A traced Core in one process: trace episodes over a memory store installed,
 * a gateway handed their capture source and the channel scope, a scripted
 * client paired by a person outside every scope, and trial ports over it.
 */
export async function offlineHarness(script: ReadScript = ANSWER_ROWS) {
  const store = new ClientGatewayTraceMemoryStore();
  let traces = 0;
  const episodes = new AutomationStudioGatewayTraceEpisodes({
    enabled: true,
    storeFor: () => store,
    now: () => Date.now(),
    flush: { everyEvents: 10_000, intervalMs: 60_000 },
    contractVersions: AUTOMATION_STUDIO_OFFLINE_TRIAL_READER_CONTRACTS,
    gatewayStreams: Object.values(CLIENT_GATEWAY_TRACE_TAP_STREAMS),
    newTraceId: () => {
      traces += 1;
      return `trace.offline-${traces}`;
    }
  });
  const uninstall = AutomationStudioGatewayTraceInstallation.install(episodes);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 5_000, channelScope: AutomationStudioChannelScope.gatewaySource, ...(episodes.gatewaySource ? { trace: episodes.gatewaySource } : {}) });
  const live = await pairScriptedClient(gateway, script);
  const runtimeService = new RuntimeService();
  runtimeService.registerTransport(new ClientGatewayRuntimeTransport({ gateway }));
  const io = new IoRegistry();
  // Reached only when no client serves the read: a run that falls back here never went through the channel.
  const localDispatches: string[] = [];
  io.registerOutput(DOMAIN, defineOutput({ definition: { id: READ, title: "Read rows" }, mode: "request", dispatch: (request) => {
    localDispatches.push(request.outputId);
    return { ok: false, outputId: request.outputId, error: "dispatched locally" };
  } }));
  const judged: Parameters<AutomationStudioCandidateTrialPorts["judge"]>[0][] = [];
  const verdict: { current: AutomationStudioBuildTestVerdict } = { current: { verdict: "yes", spent: { ...SPENT } } };
  const executed = new Map<string, AutomationStudioGraphExecutionTrace>();
  const batches = new Map<string, AutomationStudioRecordBatch[]>();
  const sessions: AutomationStudioRuntimeSession[] = [];
  let runs = 0;
  const ports: AutomationStudioCandidateTrialPorts = {
    projectId: PROJECT, flowId: PARENT.flowId, sourceInstructionIds: ["instruction"], registry: REGISTRY, resolution: RESOLUTION,
    parentFlow: async () => structuredClone(PARENT), currentBaseDigest: async () => "base", snapshots: async () => [], deprecatedPublicationIds: async () => [],
    openSession: async ({ runId, metadata }) => {
      const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId, projectId: PROJECT, targetKind: "flow", targetId: PARENT.flowId, flowId: PARENT.flowId, status: "queued", queuedAt: 1, flow: { flowId: PARENT.flowId } as AutomationStudioRuntimeSession["flow"], metadata };
      sessions.push(structuredClone(session));
      return session;
    },
    writeSession: async (session) => {
      sessions.push(structuredClone(session));
    },
    graphOptions: ({ runId, signal }) => {
      const kept: AutomationStudioRecordBatch[] = [];
      batches.set(runId, kept);
      const options = automationStudioRunGraphOptions({ io: { io, domainId: DOMAIN }, runtimeService, signal, authorizedDomainIds: [DOMAIN], onRecordBatch: (batch) => {
        kept.push(structuredClone(batch));
        return { runId, datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "a".repeat(64), recordCount: batch.rows.length, truncated: false, invalidCount: 0, updatedAt: 1 };
      } });
      // The live recording's retry backoff costs no wall time; an offline trial's waits are its environment's.
      options.delay = async () => undefined;
      return options;
    },
    processDatasets: async () => undefined,
    recordSets: async (runId) => (batches.get(runId) ?? []).map((batch) => ({
      summary: { runId, datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "a".repeat(64), recordCount: batch.rows.length, truncated: false, invalidCount: 0, updatedAt: 1 },
      rows: structuredClone(batch.rows)
    })),
    execute: async (input) => {
      const result = await runAutomationStudioDetachedCandidate(input);
      if (result.trace) executed.set(input.runId, result.trace);
      return result;
    },
    judge: async (input) => {
      judged.push(structuredClone(input));
      return structuredClone(verdict.current);
    },
    deniedEvidenceKeys: [],
    newRunId: () => `trial.offline-${++runs}`
  };
  /** Runs `candidate` as a live trial (no environment named), recorded into its own test episode; answers its outcome and its trace id. */
  const recordLive = async (candidate: AutomationStudioFlowCandidate) => {
    const before = traces;
    const outcome = await runAutomationStudioCandidateTrial(requestFor(candidate), ports);
    if (traces !== before + 1) throw new Error(`the live trial opened ${traces - before} episodes`);
    return { outcome, traceId: `trace.offline-${traces}` };
  };
  return { store, episodes, gateway, live, runtimeService, io, localDispatches, judged, verdict, executed, batches, sessions, ports, recordLive, traces: () => traces, close: async () => {
    uninstall();
    await gateway.close();
  } };
}

/** A non-browser client paired by a person outside every scope, answering each read as `script` says. */
async function pairScriptedClient(gateway: ClientGatewayService, script: ReadScript) {
  const received: ClientGatewayServerMessage[] = [];
  const errors: unknown[] = [];
  let reads = 0;
  let sessionId = "";
  const session = gateway.connect({ socket: { send: (raw) => {
    const message = JSON.parse(raw) as ClientGatewayServerMessage;
    received.push(message);
    if (message.type !== "server.execute_action") return;
    reads += 1;
    const answer = script(message.payload.parameters, reads);
    const commandId = message.payload.commandId;
    const payload = answer.status === "succeeded" ? { commandId, status: answer.status, payload: answer.payload } : { commandId, status: answer.status, error: answer.error, failure: answer.failure };
    const text = JSON.stringify({ id: `answer.${commandId}`, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1_700_000_000_000, payload });
    setTimeout(() => {
      gateway.receiveRaw(sessionId, text).catch((error: unknown) => errors.push(error));
    }, answer.delayMs);
  } } });
  sessionId = session.sessionId;
  await gateway.receive(sessionId, { id: "hello.live", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { clientId: "client.live", clientType: "custom", name: "Scripted client", capabilities: [capability], metadata: { domainId: DOMAIN } } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId);
  if (!pairing) throw new Error("the scripted client asked for no pairing");
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  return { received, errors, commands: () => received.filter((message) => message.type === "server.execute_action") };
}

/** What an offline trial may be given besides its candidate and trace: another store the trace is read from, a session view the caller supplies, and a reevaluator for the matcher. */
export type OfflineRunOptions = { store?: ClientGatewayTraceStore; sessionView?: ClientGatewayClientHello; reevaluator?: ClientGatewayTraceReevaluator };

/** An offline trial of `candidate` on the trace `traceId`, through the harness's own ports and gateway. */
export function runOffline(harness: OfflineHarness, candidate: AutomationStudioFlowCandidate, traceId: string, phase: AutomationStudioOfflineTrialPhase = "test", options: OfflineRunOptions = {}) {
  return runAutomationStudioOfflineCandidateTrial({
    request: requestFor(candidate), ports: harness.ports, source: { store: options.store ?? harness.store, traceId }, gateway: harness.gateway, phase,
    ...(options.sessionView === undefined ? {} : { sessionView: options.sessionView }),
    ...(options.reevaluator === undefined ? {} : { reevaluator: options.reevaluator })
  });
}

/** The saved trace's row ordinals one node of the trial's run kept, by the node's plan key; undefined when it did not run. */
export function keptOrdinals(harness: OfflineHarness, runId: string | undefined, nodeKey: string): number[] | undefined {
  const attempts = runId === undefined ? [] : harness.executed.get(runId)?.attempts ?? [];
  const attempt = attempts.filter((item) => item.nodeId.endsWith(`.${nodeKey}`)).at(-1);
  if (attempt === undefined) return undefined;
  const items = attempt.outputs.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => ordinalOf(item));
}

function ordinalOf(item: JsonValue): number {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return -1;
  const marker = item.$datasetRow;
  if (marker === null || typeof marker !== "object" || Array.isArray(marker)) return -1;
  return typeof marker.ordinal === "number" ? marker.ordinal : -1;
}
