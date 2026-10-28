// P6 (t769; T21, T09): a subflow builder's offline-first test, on the real
// offline subflow runner over a recorded live partial trial (the offline
// harnesses; a scripted judge, no model). A proposal that adds a command
// meets a gap, so the test runs live in the same call, naming the step; that
// live trial's trace becomes the scope's recording, so the next revision runs
// offline against it; and an offline run's derived trace never does.
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTrialOfflineFirstStep } from "../../../flow-bootstrap/offline-first/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { offlineHarness, type OfflineHarness } from "../../offline-trial/tests/offline-harness.ts";
import { SCOPE, subflowHarness, subflowOf, subflowRequestFor } from "../../offline-trial/tests/subflow-harness.ts";
import { automationStudioSubflowTrialPort } from "../../subflow-trial/index.ts";
import { automationStudioOfflineFirstSubflow, type AutomationStudioOfflineTrialHost } from "../index.ts";

const NO: AutomationStudioBuildTestVerdict = {
  verdict: "no", expected: "Only lamps priced above the limit.", observed: "Too few rows were kept.", findings: [], records: { stored: 1, refused: 0, missingRequired: 0 },
  spent: { inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.001, calls: 2 }
};

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** A traced harness, the build's live partial-trial port, and an offline-first factory beside it. */
async function build(phase: "test" | "repair" = "test") {
  harness = await offlineHarness();
  const subflows = subflowHarness(harness);
  const host: AutomationStudioOfflineTrialHost = { gateway: harness.gateway, storeFor: () => harness!.store, sessionViewFor: () => undefined };
  const live = automationStudioSubflowTrialPort(SCOPE.buildId, subflows.ports);
  const offline = automationStudioOfflineFirstSubflow({ buildId: SCOPE.buildId, ports: subflows.ports, installation: host, phase });
  /** A live partial trial, as the gate runs it, and every record the port kept handed to the factory. */
  const runLive = async (proposal: ReturnType<typeof subflowOf>) => {
    const result = await live.port(subflowRequestFor(proposal));
    live.records().forEach((record) => offline.observe(record));
    return result;
  };
  return { harness, subflows, live, offline, runLive };
}

describe("a subflow's first test", () => {
  it("has no recording of its scope, so it runs live and nothing runs offline", async () => {
    const { harness, offline } = await build();

    expect(await offline.offlineFirst(subflowRequestFor(subflowOf({ queries: ["lamps"], threshold: 10 })))).toEqual({ kind: "live", note: { outcome: "not_tried", why: "no_live_source" } });
    expect(harness.traces()).toBe(0);
  });

  it("is not tried for a request of another build", async () => {
    const { offline, runLive } = await build();
    await runLive(subflowOf({ queries: ["lamps"], threshold: 10 }));
    const request = subflowRequestFor(subflowOf({ queries: ["lamps"], threshold: 15 }, 2));

    const answer = await offline.offlineFirst({ ...request, scope: { ...request.scope, buildId: "build.other" } });

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_request_mismatch" } });
  });
});

describe("a missing transition found through the recording (T21, T09)", () => {
  it("runs live on a gap, the new live trace becomes the source, and the derived trace never does", async () => {
    const { harness, subflows, live, offline, runLive } = await build();
    await runLive(subflowOf({ queries: ["lamps", "desks"], threshold: 10 }));
    expect(live.records()).toHaveLength(1);
    const first = live.records()[0]!;
    expect(first).toMatchObject({ entryPrepared: true, execution: "succeeded", traceId: "trace.offline-1" });

    // An added command (T09): the recording cannot answer it.
    const added = subflowOf({ queries: ["lamps", "chairs", "desks"], threshold: 10 }, 2);
    const gap = await offline.offlineFirst(subflowRequestFor(added));

    expect(gap).toMatchObject({ kind: "live", note: { outcome: "gap", why: "argument_mismatch", step: 3 }, checked: { matched: 1, recorded: 2 } });
    const step = automationStudioTrialOfflineFirstStep(gap, { revision: 2, digest: added.digest });
    expect(step).toMatchObject({ kind: "live", logged: { outcome: "gap" } });
    // Step 3: the start, the recorded first read, then the added read the recording cannot answer.
    const gapRun = offline.offlineRecords()[0]!;
    expect(gapRun).toMatchObject({ answered: "live", record: { execution: "failed", verdict: "execution_failed" }, evidence: { verdict: "inconclusive", reasonCodes: ["argument_mismatch"] } });
    expect(live.records()).toHaveLength(1);
    expect(harness.live.commands()).toHaveLength(2);

    // The gate then runs the revision live in the same call; its trace becomes the scope's recording.
    await runLive(added);
    const second = live.records()[1]!;
    expect(second).toMatchObject({ revision: 2, execution: "succeeded", entryPrepared: true });
    expect(second.traceId).not.toBe(first.traceId);
    expect(harness.live.commands()).toHaveLength(5);

    // The next revision runs offline against that new recording, and a demonstrated no is kept.
    harness.verdict.current = NO;
    const narrowed = subflowOf({ queries: ["lamps", "chairs", "desks"], threshold: 15 }, 3);
    const kept = await offline.offlineFirst(subflowRequestFor(narrowed));

    expect(kept).toMatchObject({ kind: "kept", result: { partial: true, scope: "subflow", revision: 3, verdict: "no", entryPrepared: true }, checked: { matched: 3, recorded: 3 } });
    const keptRun = offline.offlineRecords()[1]!;
    expect(keptRun.evidence.sourceEpisodeIds).toEqual([second.trialRunId]);
    expect(harness.live.commands()).toHaveLength(5);
    expect(live.records()).toHaveLength(2);

    // Neither offline run's derived trace is ever a recording to run against.
    for (const entry of offline.offlineRecords()) expect(offline.observe(entry.record)).toBe(false);
    const again = await offline.offlineFirst(subflowRequestFor(subflowOf({ queries: ["lamps", "chairs", "desks"], threshold: 16 }, 4)));
    expect(again).toMatchObject({ kind: "kept" });
    expect(offline.offlineRecords()[2]!.evidence.sourceEpisodeIds).toEqual([second.trialRunId]);
    expect(subflows.judged.length).toBeGreaterThan(0);
  });
});
