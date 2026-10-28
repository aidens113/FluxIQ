// The host's trace wiring when a process builds more than one runtime, as the
// web host does: it builds a domain-less instance, then, when exactly one
// domain is registered, a second it serves from, abandoning the first
// (`apps/web/src/lib/fluxiq.ts`). The serving runtime's gateway must capture
// the episodes its service opens. Refusing the second installation once left
// that gateway with no source while every run wrote an empty trace (lane T,
// P2 M, measured in the Lab's replays).

import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientGatewayService, type ClientGatewaySession } from "../../../../../../client-gateway/index.ts";
import { AutomationStudioOfflineTrialInstallation } from "../../../service/offline-first/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../installation.ts";
import { createAutomationStudioGatewayTraceHost } from "../host.ts";
import { automationStudioOfflineTrialSessionView } from "../offline-trial-session-view.ts";
import type { AutomationStudioGatewayTraceHost, AutomationStudioGatewayTraceOfflineTrialGateway } from "../types.ts";

const hosts: AutomationStudioGatewayTraceHost[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.uninstall();
});

const host = (): AutomationStudioGatewayTraceHost => {
  const built = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => undefined });
  hosts.push(built);
  return built;
};

const episode = { projectId: "project.host", episodeId: "run.host", activity: "execution" as const, context: { schema: { name: "test.host", version: "1" }, value: null } };

describe("createAutomationStudioGatewayTraceHost", () => {
  it("lets the runtime built last serve: its gateway captures the episodes its service opens, the abandoned one's does not", async () => {
    const abandoned = host();
    const serving = host();
    expect(serving.source).toBeDefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(serving.episodes);

    const installed = AutomationStudioGatewayTraceInstallation.current();
    let servingSink: unknown;
    let abandonedSink: unknown;
    await installed!.run(episode, async () => {
      servingSink = serving.source!.current();
      abandonedSink = abandoned.source!.current();
    });
    expect(servingSink).toBeDefined();
    expect(abandonedSink).toBeUndefined();
  });

  it("builds and installs nothing when off", () => {
    const off = createAutomationStudioGatewayTraceHost({ enabled: false, pool: () => undefined });
    expect(off.source).toBeUndefined();
    expect(off.episodes).toBeUndefined();
    expect(off.storeFor).toBeUndefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });
});

// Offline-first trials in builds (trace plan P6, t769, D44): the host installs
// them over the client gateway and its own trace stores when tracing is on, and
// its `uninstall` removes them with the episodes.
describe("the trace host's offline-first trials", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  const SESSION: ClientGatewaySession = { sessionId: "session.live", clientId: "client.live", clientType: "extension", name: "Live extension", status: "ready", connectedAt: 1, lastSeenAt: 1, projectId: "project.host", capabilities: [{ id: "example.actions", kind: "action" }] };

  function gateway(sessions: ClientGatewaySession[]): AutomationStudioGatewayTraceOfflineTrialGateway {
    const live = new ClientGatewayService();
    return {
      attachScopedSession: (input) => live.attachScopedSession(input),
      receiveRaw: (sessionId, text) => live.receiveRaw(sessionId, text),
      receiveTraceArtifact: (sessionId, upload) => live.receiveTraceArtifact(sessionId, upload),
      disconnect: (sessionId, reason) => live.disconnect(sessionId, reason),
      snapshot: () => ({ enabled: true, sessions, pairings: [], trustedClients: [], auditLog: [] }),
      isScopedSession: () => false
    };
  }

  it("installs, when on, the gateway, the host's own trace stores and the project's live session view", () => {
    vi.stubEnv("FLUXIQ_OFFLINE_TRIALS", undefined);
    const built = host();
    expect(built.storeFor).toBeDefined();
    const port = gateway([SESSION]);
    built.installOfflineTrials(port);

    const installed = AutomationStudioOfflineTrialInstallation.current();
    expect(installed).toBeDefined();
    expect(installed!.gateway).toBe(port);
    expect(installed!.storeFor).toBe(built.storeFor);
    expect(installed!.storeFor("project.host")).toBe(built.storeFor!("project.host"));
    expect(installed!.sessionViewFor("project.host")).toEqual(automationStudioOfflineTrialSessionView(port, "project.host"));
    expect(installed!.sessionViewFor("project.host")).toMatchObject({ clientType: "extension", name: "Live extension" });
    expect(installed!.sessionViewFor("project.other")).toBeUndefined();
    expect(installed!.reevaluator).toBeUndefined();

    built.uninstall();
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });

  it("lets the runtime built last serve offline-first trials, and the abandoned one's uninstall leaves them", () => {
    const abandoned = host();
    abandoned.installOfflineTrials(gateway([]));
    const serving = host();
    const port = gateway([SESSION]);
    serving.installOfflineTrials(port);
    abandoned.uninstall();
    expect(AutomationStudioOfflineTrialInstallation.current()?.gateway).toBe(port);
  });

  it("installs nothing when tracing is off", () => {
    const off = createAutomationStudioGatewayTraceHost({ enabled: false, pool: () => undefined });
    off.installOfflineTrials(gateway([SESSION]));
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
  });

  it("is turned off by FLUXIQ_OFFLINE_TRIALS=0 although installed", () => {
    vi.stubEnv("FLUXIQ_OFFLINE_TRIALS", "0");
    host().installOfflineTrials(gateway([SESSION]));
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
  });
});
