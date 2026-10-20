// A trial's episode records where its world came from (traces and offline
// trials, P4, source test T24): a live trial's trace is live; a trial in any
// other environment records a derived replay, naming the recorded traces in
// force (none outside an offline trial), and is never live.
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioVirtualClock, automationStudioLiveRunEnvironment, createAutomationStudioScopedRunEnvironment, type AutomationStudioRunEnvironment } from "../../../environment/index.ts";
import { AutomationStudioGatewayTraceInstallation, AutomationStudioGatewayTraceReplaySources } from "../../index.ts";
import { newEpisodes } from "../../tests/episode-builders.ts";
import { withAutomationStudioGatewayTraceTrial } from "../index.ts";

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

/** Runs one trial episode in `environment` and answers its stored manifest's origin. */
async function originOf(environment: AutomationStudioRunEnvironment | undefined) {
  const harness = newEpisodes();
  uninstall = AutomationStudioGatewayTraceInstallation.install(harness.episodes);
  const context = (runId: string) => ({ schema: { name: "automation-studio.candidate-trial", version: "1" }, value: { runId } });
  await withAutomationStudioGatewayTraceTrial({ projectId: "project-1", flowId: "flow-1", prefix: "trial", newRunId: () => "trial-1", environment, context }, async () => undefined);
  uninstall();
  uninstall = undefined;
  return (await harness.stores.get("project-1")?.readManifest("trace-1"))?.origin;
}

describe("a trial episode's origin", () => {
  it("is live for a live trial, named or not", async () => {
    expect(await originOf(undefined)).toEqual({ kind: "live" });
    expect(await originOf(automationStudioLiveRunEnvironment)).toEqual({ kind: "live" });
  });

  it("is a derived replay of the recorded traces in force for an offline trial", async () => {
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock: new AutomationStudioVirtualClock(0) });
    const origin = await AutomationStudioGatewayTraceReplaySources.run(["trace.source"], () => originOf(environment));
    expect(origin).toEqual({ kind: "derived", derivation: "replay", sourceTraceIds: ["trace.source"] });
  });

  it("is derived for a fixture trial too, naming no source outside an offline trial", async () => {
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(0) });
    expect(await originOf(environment)).toEqual({ kind: "derived", derivation: "replay", sourceTraceIds: [] });
    expect(AutomationStudioGatewayTraceReplaySources.current()).toBeUndefined();
  });
});
