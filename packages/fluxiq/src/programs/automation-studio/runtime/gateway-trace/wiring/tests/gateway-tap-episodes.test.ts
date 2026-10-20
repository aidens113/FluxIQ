// @fluxiq-test-group real-sql
// T02 and T03 (traces and offline trials, P2): a deterministic scripted-client
// run through the production executor, graph options, RuntimeService and the
// client gateway's transport (the fixture pattern of
// `../../environment/tests/fixture-client.ts`), with tracing on and off.
// T02: the same node outcome and the same outbound commands apart from the
// trace stamp, with the time and stored bytes measured and printed. T03:
// exploration, test and execution episodes all record through the one gateway
// tap, into the project's SQLite store, and read back complete.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_TRACE_METADATA_KEY,
  ClientGatewayService,
  evaluateClientGatewayTraceCompleteness,
  type ClientGatewayCapability,
  type ClientGatewayServerMessage,
  type ClientGatewayTraceActivity,
  type ClientGatewayTraceCaptureSource,
  type ClientGatewayTraceStore
} from "../../../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../../io/index.ts";
import { ClientGatewayRuntimeTransport, RuntimeService } from "../../../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectGatewayTraceStore } from "../../../../storage/index.ts";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../../environment/index.ts";
import { FixtureGatewayClient } from "../../../environment/tests/fixture-client.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { AUTOMATION_STUDIO_PROJECT_DATABASE_IDLE_CLOSE_MS } from "../../../service/projects/index.ts";
import { automationStudioRunGraphOptions } from "../../../service/runtime-session/index.ts";
import type { AutomationStudioGatewayTraceEpisodes } from "../../index.ts";
import { AutomationStudioGatewayTraceServicePools, createAutomationStudioGatewayTraceHost } from "../index.ts";

const ACTION = "fixture.tally.add";
const DOMAIN = "fixture";
const PROJECT = "project.gateway-trace-episodes";
const capability: ClientGatewayCapability = { id: "fixture.actions", kind: "action", actionTypes: [ACTION], metadata: { domainId: DOMAIN } };

function tallyFlow(steps: number): AutomationStudioFlowDocument {
  const nodes = Array.from({ length: steps }, (_, index) => ({ id: `add-${index}`, definitionId: "builtin.policy.action", parameterValues: { outputId: ACTION, parameters: { amount: index + 1 } } }));
  const edges = nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id }));
  return { schemaVersion: "0.1", flowId: "flow.fixture-tally", ownerKind: "task", ownerId: "task.fixture-tally", name: "Fixture tally", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** One scripted run: a gateway (traced through `trace` when given), a scoped fixture client, and the production run path. */
async function scriptedRun(steps: number, trace: ClientGatewayTraceCaptureSource | undefined, around: <T>(work: () => Promise<T>) => Promise<T>) {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 2_000, channelScope: AutomationStudioChannelScope.gatewaySource, ...(trace ? { trace } : {}) });
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(1_700_000_000_000), random: () => 0.5 });
  const answers = Array.from({ length: steps }, (_, index) => ({ actionType: ACTION, parameters: { amount: index + 1 }, occurrence: 1, result: { status: "succeeded" as const, payload: { total: index + 1 } } }));
  const fixture = new FixtureGatewayClient(gateway, answers);
  fixture.attach(environment.scopeId, { clientType: "custom", name: "Fixture client", capabilities: [capability], metadata: { domainId: DOMAIN } });
  const runtimeService = new RuntimeService();
  runtimeService.registerTransport(new ClientGatewayRuntimeTransport({ gateway }));
  const io = new IoRegistry();
  io.registerOutput(DOMAIN, defineOutput({ definition: { id: ACTION, title: "Add to tally" }, mode: "request", dispatch: (request) => ({ ok: false, outputId: request.outputId, error: "dispatched locally" }) }));
  const options = automationStudioRunGraphOptions({ io: { io, domainId: DOMAIN }, runtimeService, signal: new AbortController().signal, authorizedDomainIds: [DOMAIN] });
  options.now = environment.now;
  options.delay = environment.delay;
  options.random = environment.random;
  const started = performance.now();
  const result = await around(() => environment.within(() => runAutomationStudioGraph(tallyFlow(steps), options)));
  const elapsedMs = performance.now() - started;
  return { result, elapsedMs, commands: fixture.received.filter((message) => message.type === "server.execute_action") };
}

/** A node attempt's outcome, without the runtime command id minted per run. */
function outcome(attempt: { nodeId: string; status: string; outputs?: unknown }): unknown {
  const outputs: Record<string, unknown> = { ...(attempt.outputs as Record<string, unknown> | undefined) };
  delete outputs.runtimeCommandId;
  return [attempt.nodeId, attempt.status, outputs];
}

/** A command as the client acts on it: no command id (minted per run) and no trace stamp. */
function unstamped(message: ClientGatewayServerMessage): unknown {
  if (message.type !== "server.execute_action") return message.type;
  const metadata: JsonObject = { ...(message.payload.metadata ?? {}) };
  delete metadata[CLIENT_GATEWAY_TRACE_METADATA_KEY];
  return { actionType: message.payload.actionType, parameters: message.payload.parameters, metadata };
}

async function temporaryPool() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-gateway-trace-episodes-"));
  // The service's pool keeps a project open for a grace period between leases; so does this one.
  const pool = new AutomationStudioProjectDatabasePool({ rootDir, idleCloseMs: AUTOMATION_STUDIO_PROJECT_DATABASE_IDLE_CLOSE_MS });
  const dispose = async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  };
  return { pool, dispose };
}

async function readBack(store: ClientGatewayTraceStore, traceId: string) {
  const manifest = await store.readManifest(traceId);
  if (manifest === undefined) throw new Error(`no manifest for ${traceId}`);
  const events = await store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
  const availableArtifacts = await store.listArtifacts(traceId);
  const completeness = evaluateClientGatewayTraceCompleteness({ manifest, events, availableArtifacts, compatibility: { status: "compatible" }, recorderActive: false });
  return { manifest, events, completeness };
}

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The host's episodes over a temporary SQLite pool, as `programs/_shared/runtime.ts` builds them for a service. */
async function tracedHost() {
  const { pool, dispose } = await temporaryPool();
  cleanups.push(dispose);
  const service = {};
  AutomationStudioGatewayTraceServicePools.adopt(service, pool);
  let traces = 0;
  const host = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => AutomationStudioGatewayTraceServicePools.of(service), options: { newTraceId: () => `trace.${++traces}` } });
  cleanups.push(host.uninstall);
  return { host, episodes: host.episodes as AutomationStudioGatewayTraceEpisodes, pool };
}

function episode(episodeId: string, activity: ClientGatewayTraceActivity) {
  return { projectId: PROJECT, episodeId, activity, context: { schema: { name: "automation-studio.test-context", version: "1" }, value: { episodeId } } };
}

describe("T02: a scripted run traced and untraced", () => {
  it("ends the same and sends the same commands apart from the trace stamp; the cost is measured", async () => {
    const steps = 12;
    const { host, episodes, pool } = await tracedHost();
    // Warmed first, both ways, so the project database's creation and migration and the first module loads are not measured as per-command cost.
    await scriptedRun(steps, undefined, (work) => work());
    await scriptedRun(steps, host.source, (work) => episodes.run(episode("run.t02-warm", "execution"), work));
    const untraced = await scriptedRun(steps, undefined, (work) => work());
    const traced = await scriptedRun(steps, host.source, (work) => episodes.run(episode("run.t02", "execution"), work));

    expect(traced.result.status).toBe("succeeded");
    expect(traced.result.status).toBe(untraced.result.status);
    expect(traced.result.attempts.map(outcome)).toEqual(untraced.result.attempts.map(outcome));
    expect(traced.commands).toHaveLength(steps);
    expect(traced.commands.map(unstamped)).toEqual(untraced.commands.map(unstamped));
    // Only the traced run's commands carry the stamp.
    expect(traced.commands.every((message) => message.type === "server.execute_action" && message.payload.metadata?.[CLIENT_GATEWAY_TRACE_METADATA_KEY] !== undefined)).toBe(true);
    expect(untraced.commands.some((message) => message.type === "server.execute_action" && message.payload.metadata?.[CLIENT_GATEWAY_TRACE_METADATA_KEY] !== undefined)).toBe(false);

    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT });
    try {
      const { events, completeness } = await readBack(store, "trace.2");
      expect(completeness.status).toBe("complete");
      const storedBytes = events.reduce((total, event) => total + Buffer.byteLength(JSON.stringify(event)), 0);
      const sentBytes = traced.commands.reduce((total, message) => total + Buffer.byteLength(JSON.stringify(message)), 0);
      console.log(`T02 overhead (warm; the traced time includes opening, flushing and closing the trace in SQLite): ${steps} commands; untraced ${untraced.elapsedMs.toFixed(1)} ms, traced ${traced.elapsedMs.toFixed(1)} ms (${((traced.elapsedMs - untraced.elapsedMs) / steps).toFixed(2)} ms per command); ${events.length} events stored, ${storedBytes} bytes (${(storedBytes / steps).toFixed(0)} per command; ${sentBytes} bytes sent)`);
      expect(events.filter((event) => event.kind === "outbound")).toHaveLength(steps);
    } finally {
      await store.close();
    }
  });
});

describe("T03: every kind of episode records through the one gateway tap into the SQLite store", () => {
  it("reads back an exploration, a test nested in it, and an execution episode, each complete, each with only its own commands", async () => {
    const { host, episodes, pool } = await tracedHost();
    await scriptedRun(2, host.source, (work) => episodes.run(episode("build.t03", "exploration"), async () => {
      const explored = await work();
      // The trial runs on its own client inside the build: its commands go to its own trace.
      await scriptedRun(3, host.source, (trial) => episodes.run(episode("trial.t03", "test"), trial));
      return explored;
    }));
    await scriptedRun(4, host.source, (work) => episodes.run(episode("run.t03", "execution"), work));

    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: PROJECT });
    try {
      const build = await readBack(store, "trace.1");
      const trial = await readBack(store, "trace.2");
      const run = await readBack(store, "trace.3");
      for (const trace of [build, trial, run]) {
        expect(trace.completeness).toMatchObject({ status: "complete", issues: [] });
        expect(trace.manifest.streams).toEqual(["gateway", "artifact", "control"]);
        expect(trace.manifest.contractVersions).toMatchObject({ "client-gateway.protocol": expect.any(String), "client-gateway.trace-schema": "1", "client-gateway.trace-capture-boundary": "1" });
      }
      expect([build.manifest.activity, trial.manifest.activity, run.manifest.activity]).toEqual(["exploration", "test", "execution"]);
      expect([build.manifest.episodeId, trial.manifest.episodeId, run.manifest.episodeId]).toEqual(["build.t03", "trial.t03", "run.t03"]);
      const outbound = (trace: typeof build) => trace.events.filter((event) => event.kind === "outbound").length;
      expect([outbound(build), outbound(trial), outbound(run)]).toEqual([2, 3, 4]);
      // The build keeps markers naming the trial's trace; the trial's own trace has none of the build's commands.
      const markers = build.events.filter((event) => event.messageType?.startsWith("control.child_episode") === true);
      expect(markers.map((event) => event.messageType)).toEqual(["control.child_episode_opened", "control.child_episode_closed"]);
      expect(markers[0]?.payload).toMatchObject({ encoding: "json", value: { traceId: "trace.2", episodeId: "trial.t03", activity: "test" } });
      // Each result went to the trace its command was sent from.
      for (const trace of [build, trial, run]) {
        const sent = new Set(trace.events.filter((event) => event.kind === "outbound").map((event) => event.correlation.commandId));
        const answered = trace.events.filter((event) => event.kind === "inbound" && event.messageType === "client.action_result").map((event) => event.correlation.commandId);
        expect(answered.length).toBe(sent.size);
        expect(answered.every((commandId) => sent.has(commandId))).toBe(true);
      }
    } finally {
      await store.close();
    }
  });

  it("touches no store with tracing off", async () => {
    let pools = 0;
    const pool = () => {
      pools += 1;
      return undefined;
    };
    const host = createAutomationStudioGatewayTraceHost({ enabled: false, pool });
    const run = await scriptedRun(2, host.source, (work) => work());
    expect(run.result.status).toBe("succeeded");
    expect(pools).toBe(0);
    expect(run.commands.some((message) => message.type === "server.execute_action" && message.payload.metadata?.[CLIENT_GATEWAY_TRACE_METADATA_KEY] !== undefined)).toBe(false);
  });
});
