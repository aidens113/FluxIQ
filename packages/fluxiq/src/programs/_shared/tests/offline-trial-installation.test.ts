// The host installs offline-first trials in builds (trace plan P6, t769, D44)
// where it builds the client gateway and the gateway trace host: on whenever
// client gateway tracing is on, over the runtime's own gateway and the trace
// host's stores; nothing when tracing is off; and the process setting
// `FLUXIQ_OFFLINE_TRIALS=0` turns them off although installed.

import { afterEach, expect, it, vi } from "vitest";
import { ClientGatewayService, ClientGatewayTraceMemoryStore } from "../../../client-gateway/index.ts";
import { createGlobalProgramRuntime } from "../../index.ts";
import { AutomationStudioOfflineTrialInstallation } from "../../automation-studio/runtime/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../automation-studio/runtime/gateway-trace/index.ts";

/** Clears whatever a runtime installed: installing and at once uninstalling leaves nothing installed. */
function clearInstallations(): void {
  AutomationStudioOfflineTrialInstallation.install({ gateway: new ClientGatewayService(), storeFor: () => new ClientGatewayTraceMemoryStore(), sessionViewFor: () => undefined })();
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  if (episodes !== undefined) AutomationStudioGatewayTraceInstallation.install(episodes)();
}

afterEach(() => {
  vi.unstubAllEnvs();
  clearInstallations();
});

async function close(runtime: ReturnType<typeof createGlobalProgramRuntime>): Promise<void> {
  await runtime.automationStudio.close();
  runtime.secretKeys.close();
}

it("installs nothing when client gateway tracing is off", async () => {
  vi.stubEnv("FLUXIQ_CLIENT_GATEWAY_TRACE", undefined);
  vi.stubEnv("FLUXIQ_OFFLINE_TRIALS", undefined);
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  try {
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
  } finally {
    await close(runtime);
  }
});

it("installs offline-first trials over the runtime's client gateway when tracing is on", async () => {
  vi.stubEnv("FLUXIQ_CLIENT_GATEWAY_TRACE", "1");
  vi.stubEnv("FLUXIQ_OFFLINE_TRIALS", undefined);
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  try {
    const installed = AutomationStudioOfflineTrialInstallation.current();
    expect(installed).toBeDefined();
    expect(installed!.gateway).toBe(runtime.clientGateway);
    expect(installed!.reevaluator).toBeUndefined();
    // No session is connected, so there is no live view to fall back on.
    expect(installed!.sessionViewFor("project.none")).toBeUndefined();
    // The trace host's store: a service without project storage keeps a project's traces in one memory store.
    expect(installed!.storeFor("project.one")).toBe(installed!.storeFor("project.one"));
  } finally {
    await close(runtime);
  }
});

it("is turned off by FLUXIQ_OFFLINE_TRIALS=0 although tracing is on", async () => {
  vi.stubEnv("FLUXIQ_CLIENT_GATEWAY_TRACE", "1");
  vi.stubEnv("FLUXIQ_OFFLINE_TRIALS", "0");
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  try {
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
  } finally {
    await close(runtime);
  }
});
