// P4c: what an offline trial is and is not. Its own capture is a derived trace
// naming the trace it ran on, never live, and an offline trial cannot run on
// it; its result is never a live success nor the whole-run gate's pass (T24).
// It never runs during exploration (Decision 2), and the trial gate reads its
// port as offline: no start hook, no reset (Decisions 3 and 6).
import { afterEach, describe, expect, it } from "vitest";
import { isClientGatewayTraceLive } from "../../../../../../client-gateway/index.ts";
import { isAutomationStudioTrialEvidenceLiveSuccess, satisfiesAutomationStudioWholeRunGate, tallyAutomationStudioLiveEpisodes } from "../../../../model/index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../../environment/index.ts";
import { automationStudioCandidateTrialOffline } from "../../../flow-bootstrap/candidate/index.ts";
import { automationStudioCandidateTrialPort } from "../../candidate-trial/index.ts";
import { runAutomationStudioOfflineCandidateTrial } from "../index.ts";
import { candidateOf, offlineHarness, requestFor, runOffline, type OfflineHarness } from "./offline-harness.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("an offline trial's provenance", () => {
  it("records its own capture as a derived trace of the trace it ran on, which can never count as live (T24)", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    const source = await harness.store.readManifest(recorded.traceId);
    expect(source?.origin).toEqual({ kind: "live" });

    const offline = await runOffline(harness, candidate, recorded.traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    const own = await harness.store.readManifest("trace.offline-2");
    expect(own).toMatchObject({ episodeId: offline.trial.result.trialRunId, activity: "test", origin: { kind: "derived", derivation: "replay", sourceTraceIds: [recorded.traceId] } });
    expect(isClientGatewayTraceLive(own!)).toBe(false);
    const events = await harness.store.readEventRange("trace.offline-2", 1, Number.MAX_SAFE_INTEGER);
    expect(events.some((event) => event.messageType === "server.execute_action")).toBe(true);
    expect(events.every((event) => event.provenance.origin === "derived")).toBe(true);
    // Its result is evidence, original but never live: no live success, no whole-run pass, no live episode counted.
    expect(offline.evidence).toMatchObject({ verdict: "pass", provenance: "original", liveEpisodeId: null });
    expect(isAutomationStudioTrialEvidenceLiveSuccess(offline.evidence)).toBe(false);
    expect(satisfiesAutomationStudioWholeRunGate(offline.evidence, { candidateRevision: 1, candidateDigest: candidate.digest, goalContractVersion: offline.evidence.goalContractVersion })).toBe(false);
    expect(tallyAutomationStudioLiveEpisodes([offline.evidence])).toEqual({ liveEpisodes: 0, liveSuccesses: 0 });
    // An offline trial cannot run on a derived trace: it holds no live episode's capture.
    const judged = harness.judged.length;
    const again = await runOffline(harness, candidate, "trace.offline-2");
    expect(again).toEqual({ status: "refused", reasonCode: "source_not_live", detail: expect.any(String) });
    expect(harness.judged).toHaveLength(judged);
    expect(await harness.store.readManifest("trace.offline-3")).toBeUndefined();
  });

  it("never runs during exploration: nothing reaches the gateway, no episode opens, no judge is asked", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    const judged = harness.judged.length;

    const refused = await runOffline(harness, candidate, recorded.traceId, "exploration");

    expect(refused).toEqual({ status: "refused", reasonCode: "offline_not_allowed_in_phase", detail: expect.any(String) });
    expect(harness.judged).toHaveLength(judged);
    expect(await harness.store.readManifest("trace.offline-2")).toBeUndefined();
    expect(harness.live.commands()).toHaveLength(1);
  });

  it("refuses a trace the store does not hold, before anything runs", async () => {
    harness = await offlineHarness();
    const refused = await runOffline(harness, candidateOf({ query: "lamps", threshold: 10 }), "trace.missing");
    expect(refused).toMatchObject({ status: "refused", reasonCode: "incomplete_capture" });
    expect(harness.judged).toEqual([]);
  });

  it("is read as offline by the trial gate: its port offers no start hook and the runner calls none", async () => {
    harness = await offlineHarness();
    const candidate = candidateOf({ query: "lamps", threshold: 10 });
    const recorded = await harness.recordLive(candidate);
    let hooks = 0;
    const ports = { ...harness.ports, prepareStart: async () => {
      hooks += 1;
      return { put: "back" };
    } };
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock: new AutomationStudioVirtualClock(0) });
    const trials = automationStudioCandidateTrialPort("candidate.offline", { ...ports, environment });
    expect(automationStudioCandidateTrialOffline(trials.port)).toBe(true);
    expect(trials.port.prepareStart).toBeUndefined();

    const offline = await runAutomationStudioOfflineCandidateTrial({ request: requestFor(candidate), ports, source: { store: harness.store, traceId: recorded.traceId }, gateway: harness.gateway, phase: "repair" });

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.trial.record.start).toEqual({ status: "not_reset" });
    expect(offline.trial.result.acts).toBeUndefined();
    expect(hooks).toBe(0);
  });
});
