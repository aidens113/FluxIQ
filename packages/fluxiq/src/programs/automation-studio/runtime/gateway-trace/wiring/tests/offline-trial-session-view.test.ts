// The live session's public view a build's offline-first trial is handed when
// its source trace recorded none (trace plan P6, t769, core-design section 6):
// the one connected, paired, unscoped session of the build's project that can
// take actions, mapped exactly as a recorded `session.claimed` is. None or
// several is no view, so the trial is refused and runs live.

import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  readClientGatewayTraceSessions,
  type ClientGatewayCapability,
  type ClientGatewaySession,
  type ClientGatewaySnapshotView
} from "../../../../../../client-gateway/index.ts";
import { createAutomationStudioGatewayTraceHost } from "../host.ts";
import { automationStudioOfflineTrialSessionView } from "../offline-trial-session-view.ts";
import type { AutomationStudioGatewayTraceHost } from "../types.ts";

const PROJECT = "project.offline-view";
const TRACE = "trace.offline-view";
const ACTIONS: ClientGatewayCapability = { id: "example.actions", kind: "action", actionTypes: ["example.search"], metadata: { domainId: "example.domain" } };
const SNAPSHOTS: ClientGatewayCapability = { id: "example.snapshots", kind: "snapshot" };

const hosts: AutomationStudioGatewayTraceHost[] = [];
const gateways: ClientGatewayService[] = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) host.uninstall();
  for (const gateway of gateways.splice(0)) await gateway.close();
});

function message(type: string, payload: unknown): string {
  return JSON.stringify({ id: `${type}.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1_700_000_000_000, payload });
}

/** A paired live client bound to `projectId` that answers every action it is sent. */
async function pairedClient(gateway: ClientGatewayService, clientId: string, projectId: string): Promise<string> {
  let sessionId = "";
  const socket = {
    send: (raw: string) => {
      const sent = JSON.parse(raw) as { type: string; payload: { commandId: string } };
      if (sent.type !== "server.execute_action") return;
      setTimeout(() => void gateway.receiveRaw(sessionId, message("client.action_result", { commandId: sent.payload.commandId, status: "succeeded", payload: { answered: true } })), 1);
    }
  };
  sessionId = gateway.connect({ socket }).sessionId;
  await gateway.receiveRaw(sessionId, message("client.hello", { clientId, clientType: "extension", name: "Example extension", version: "2.4.0", capabilities: [ACTIONS, SNAPSHOTS], metadata: { domainId: "example.domain" } }));
  const pairing = gateway.createPairing({ projectId, requestedBySessionId: sessionId, requestedByClientId: clientId });
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.offline-view" });
  return sessionId;
}

function session(overrides: Partial<ClientGatewaySession>): ClientGatewaySession {
  return {
    sessionId: "session.one",
    clientId: "client.one",
    clientType: "extension",
    name: "Example extension",
    version: "2.4.0",
    status: "ready",
    connectedAt: 1,
    lastSeenAt: 1,
    projectId: PROJECT,
    capabilities: [ACTIONS],
    metadata: { domainId: "example.domain" },
    ...overrides
  };
}

/** A gateway port over fixed sessions, with `scoped` the ids attached under a channel scope. */
function port(sessions: ClientGatewaySession[], scoped: readonly string[] = []) {
  const snapshot: ClientGatewaySnapshotView = { enabled: true, sessions, pairings: [], trustedClients: [], auditLog: [] };
  return { snapshot: () => snapshot, isScopedSession: (sessionId: string) => scoped.includes(sessionId) };
}

describe("automationStudioOfflineTrialSessionView", () => {
  it("is, for the project's one live action session, the same view a recorded session.claimed yields", async () => {
    const host = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => undefined, options: { newTraceId: () => TRACE } });
    hosts.push(host);
    const gateway = new ClientGatewayService({ commandTimeoutMs: 5_000, trace: host.source! });
    gateways.push(gateway);
    const sessionId = await pairedClient(gateway, "client.offline-view", PROJECT);
    const episode = { projectId: PROJECT, episodeId: "run.offline-view", activity: "test" as const, context: { schema: { name: "test.offline-view", version: "1" }, value: null } };
    const result = await host.episodes!.run(episode, () => gateway.executeAction(sessionId, { actionType: "example.search", parameters: { query: "lamps" } }).result);
    expect(result.status).toBe("succeeded");

    const store = host.storeFor!(PROJECT);
    const manifest = await store.readManifest(TRACE);
    if (manifest === undefined) throw new Error("the episode wrote no trace");
    const events = await store.readEventRange(TRACE, 1, Number.MAX_SAFE_INTEGER);
    const recorded = readClientGatewayTraceSessions(manifest, events).flatMap((entry) => (entry.claimedView === null ? [] : [entry.claimedView]));
    expect(recorded).toHaveLength(1);

    const view = automationStudioOfflineTrialSessionView(gateway, PROJECT);
    expect(view).toBeDefined();
    expect(view).toEqual(recorded[0]);
    expect(view).toMatchObject({ clientType: "extension", name: "Example extension", version: "2.4.0" });
    expect(view).not.toHaveProperty("clientId");
    expect(view).not.toHaveProperty("token");
  });

  it("is that one session's view among sessions that do not qualify", () => {
    const view = automationStudioOfflineTrialSessionView(port([
      session({ sessionId: "session.live", name: "Live extension" }),
      session({ sessionId: "session.other-project", projectId: "project.other" }),
      session({ sessionId: "session.unbound", projectId: null }),
      session({ sessionId: "session.no-actions", capabilities: [SNAPSHOTS] }),
      session({ sessionId: "session.unpaired", status: "pairing_required" }),
      session({ sessionId: "session.gone", status: "disconnected", disconnectedAt: 2 }),
      session({ sessionId: "session.scoped", name: "Recorded client" })
    ], ["session.scoped"]), PROJECT);
    expect(view).toMatchObject({ clientType: "extension", name: "Live extension" });
  });

  it("is undefined when no session of the project can take actions", () => {
    expect(automationStudioOfflineTrialSessionView(port([]), PROJECT)).toBeUndefined();
    expect(automationStudioOfflineTrialSessionView(port([
      session({ sessionId: "session.other-project", projectId: "project.other" }),
      session({ sessionId: "session.no-actions", capabilities: [SNAPSHOTS] }),
      session({ sessionId: "session.unpaired", status: "connected" })
    ]), PROJECT)).toBeUndefined();
  });

  it("is undefined when two sessions of the project qualify: which client the trace stood for is not known", () => {
    expect(automationStudioOfflineTrialSessionView(port([session({ sessionId: "session.a" }), session({ sessionId: "session.b", clientId: "client.b" })]), PROJECT)).toBeUndefined();
  });

  it("ignores scoped (matcher) sessions, even the only one", () => {
    expect(automationStudioOfflineTrialSessionView(port([session({ sessionId: "session.scoped" })], ["session.scoped"]), PROJECT)).toBeUndefined();
    expect(automationStudioOfflineTrialSessionView(port([session({ sessionId: "session.scoped" }), session({ sessionId: "session.live", name: "Live extension" })], ["session.scoped"]), PROJECT)).toMatchObject({ name: "Live extension" });
  });
});
