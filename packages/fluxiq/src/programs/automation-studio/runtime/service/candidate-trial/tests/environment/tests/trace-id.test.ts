// A live trial's record names the gateway trace its run was captured in (t769,
// builds run offline trials against their latest live trace of a scope);
// without tracing it names none.
import { afterEach, describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore } from "../../../../../../../../client-gateway/index.ts";
import { AutomationStudioGatewayTraceEpisodes, AutomationStudioGatewayTraceInstallation } from "../../../../../gateway-trace/index.ts";
import { trialFixture } from "../../fixtures.ts";
import { runAutomationStudioCandidateTrial } from "../../../index.ts";

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

function installEpisodes() {
  const store = new ClientGatewayTraceMemoryStore();
  let traces = 0;
  uninstall = AutomationStudioGatewayTraceInstallation.install(new AutomationStudioGatewayTraceEpisodes({
    enabled: true, storeFor: () => store, now: () => 1_700_000_000_000, flush: { everyEvents: 1000, intervalMs: 60_000 },
    contractVersions: { "client-gateway.protocol": "0.1" }, gatewayStreams: ["gateway", "artifact"], newTraceId: () => `trace-${++traces}`
  }));
  return store;
}

describe("candidate-trial record's trace id", () => {
  it("is the trace of the episode its run opened", async () => {
    const store = installEpisodes();
    const fixture = trialFixture();
    const { record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(record.traceId).toBe("trace-1");
    expect(await store.readManifest("trace-1")).toMatchObject({ activity: "test", episodeId: record.trialRunId });
  });

  it("is absent without tracing", async () => {
    const fixture = trialFixture();
    const { record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(record).not.toHaveProperty("traceId");
  });
});
