// P6 (t769; T19): a candidate build's offline-first test of a whole candidate,
// on the real offline runner over a recorded live trial (the offline harness:
// a traced gateway, a scripted client, a scripted judge; no model). Its first
// test has no recording and runs nothing; later revisions run against the
// latest live trial's trace; a failure shown there is kept; and however many
// offline-first tests run, the live port's records, the live client and the
// live-episode tally are unchanged: offline records are kept apart.
import { afterEach, describe, expect, it } from "vitest";
import { tallyAutomationStudioLiveEpisodes } from "../../../../model/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialPort } from "../../candidate-trial/index.ts";
import { candidateOf, offlineHarness, requestFor, type OfflineHarness } from "../../offline-trial/tests/offline-harness.ts";
import { automationStudioOfflineFirstWhole, type AutomationStudioOfflineTrialHost } from "../index.ts";

const SPENT = Object.freeze({ inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.001, calls: 2 });
const NO: AutomationStudioBuildTestVerdict = { verdict: "no", expected: "Every row priced above the limit.", observed: "One row was kept.", findings: [], records: { stored: 1, refused: 0, missingRequired: 0 }, spent: { ...SPENT } };
const CANDIDATE = "candidate.offline";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** A traced harness, its live port, and an offline-first factory over the harness's gateway and store. */
async function build(phase: "test" | "repair" | "exploration" = "test", installed = true) {
  harness = await offlineHarness();
  const host: AutomationStudioOfflineTrialHost = { gateway: harness.gateway, storeFor: () => harness!.store, sessionViewFor: () => undefined };
  const live = automationStudioCandidateTrialPort(CANDIDATE, harness.ports);
  const offline = automationStudioOfflineFirstWhole({ candidateId: CANDIDATE, ports: harness.ports, installation: installed ? host : undefined, phase });
  return { harness, live, offline };
}

describe("a whole candidate's first test", () => {
  it("has no recording to run against, so it runs live and nothing runs offline", async () => {
    const { harness, offline } = await build();

    const answer = await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 10 })));

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "no_live_source" } });
    expect(harness.traces()).toBe(0);
    expect(harness.judged).toHaveLength(0);
    expect(offline.offlineRecords()).toEqual([]);
    expect(offline.spent()).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });
  });

  it("is not tried when offline trials are not installed, even with a live recording", async () => {
    const { harness, live, offline } = await build("test", false);
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));

    const answer = await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)));

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
    expect(harness.traces()).toBe(1);
  });

  it("never takes another candidate's live trial as its recording", async () => {
    const { offline, live } = await build();
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    const [record] = live.records();

    expect(offline.observe({ ...record!, candidateId: "candidate.other" })).toBe(false);
    expect(await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)))).toEqual({ kind: "live", note: { outcome: "not_tried", why: "no_live_source" } });
  });

  it("is refused in exploration, before anything runs", async () => {
    const { harness, live, offline } = await build("exploration");
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));

    const answer = await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)));

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_not_allowed_in_phase" } });
    expect(harness.traces()).toBe(1);
  });
});

describe("offline-first tests against the latest live trial (T19)", () => {
  it("keep a demonstrated no, N times over, leaving live records, the live client and the live tally unchanged", async () => {
    const { harness, live, offline } = await build();
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));
    const liveRecords = live.records();
    expect(liveRecords).toHaveLength(1);
    expect(liveRecords[0]).toMatchObject({ execution: "succeeded", verdict: "yes", traceId: "trace.offline-1" });
    const tallyBefore = tallyAutomationStudioLiveEpisodes([]);
    harness.verdict.current = NO;
    const revision = candidateOf({ query: "lamps", threshold: 15 }, 2);

    const N = 4;
    for (let index = 0; index < N; index += 1) {
      const answer = await offline.offlineFirst(requestFor(revision));
      expect(answer).toMatchObject({ kind: "kept", result: { revision: 2, digest: revision.digest, verdict: "no" }, checked: { matched: 1, recorded: 1 } });
    }

    expect(live.records()).toEqual(liveRecords);
    expect(harness.live.commands()).toHaveLength(1);
    const records = offline.offlineRecords();
    expect(records).toHaveLength(N);
    for (const entry of records) {
      expect(entry.answered).toBe("kept");
      expect(entry.evidence).toMatchObject({ verdict: "fail", liveEpisodeId: null, sourceEpisodeIds: [liveRecords[0]!.trialRunId] });
      // The offline run's own derived trace is never a recording to run against.
      expect(offline.observe(entry.record)).toBe(false);
    }
    expect(tallyAutomationStudioLiveEpisodes(records.map((entry) => entry.evidence))).toEqual(tallyBefore);
    expect(tallyBefore).toEqual({ liveEpisodes: 0, liveSuccesses: 0 });
    // The judge was paid for every offline run, and only the offline records count it.
    const judged = records.reduce((total, entry) => total + entry.record.judge.calls, 0);
    expect(judged).toBeGreaterThan(0);
    expect(offline.spent().calls).toBe(judged);
    expect(offline.spent().estimatedCostUsd).toBeCloseTo(records.reduce((total, entry) => total + entry.record.judge.estimatedCostUsd, 0));
  });

  it("reads the live port's records itself when handed them, so the live port needs no wrapper", async () => {
    harness = await offlineHarness();
    const host: AutomationStudioOfflineTrialHost = { gateway: harness.gateway, storeFor: () => harness!.store, sessionViewFor: () => undefined };
    const live = automationStudioCandidateTrialPort(CANDIDATE, harness.ports);
    const offline = automationStudioOfflineFirstWhole({ candidateId: CANDIDATE, ports: harness.ports, installation: host, phase: "repair", liveRecords: () => live.records() });
    const revision = candidateOf({ query: "lamps", threshold: 15 }, 2);
    expect(await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 10 })))).toMatchObject({ note: { outcome: "not_tried", why: "no_live_source" } });
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    harness.verdict.current = NO;

    expect(await offline.offlineFirst(requestFor(revision))).toMatchObject({ kind: "kept", result: { verdict: "no" } });
    expect(offline.offlineRecords()[0]!.evidence.sourceEpisodeIds).toEqual([live.records()[0]!.trialRunId]);
  });

  it("never runs the deployment's start hook: nothing on the site is put back for an offline run", async () => {
    const { harness, live, offline } = await build();
    let hooks = 0;
    harness.ports.prepareStart = async () => {
      hooks += 1;
      return { reset: true };
    };
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));
    expect(hooks).toBe(1);
    harness.verdict.current = NO;

    expect(await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)))).toMatchObject({ kind: "kept" });
    expect(offline.offlineRecords()[0]!.record.start).toEqual({ status: "not_reset" });
    expect(hooks).toBe(1);
  });

  it("runs a revision that passes on the recording live, noting the pass", async () => {
    const { live, offline } = await build();
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));

    const answer = await offline.offlineFirst(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)));

    expect(answer).toEqual({ kind: "live", note: { outcome: "passed" }, checked: { matched: 1, recorded: 1 } });
    expect(offline.offlineRecords().map((entry) => entry.answered)).toEqual(["live"]);
    expect(live.records()).toHaveLength(1);
  });

  it("runs a revision whose read changed live, naming the step the recording could not answer", async () => {
    const { live, offline } = await build();
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));

    const answer = await offline.offlineFirst(requestFor(candidateOf({ query: "desks", threshold: 10 }, 2)));

    expect(answer).toMatchObject({ kind: "live", note: { outcome: "gap", why: "argument_mismatch", step: 2 }, checked: { matched: 0, recorded: 1 } });
  });

  it("is not tried for a request of another candidate or whose frozen bytes differ", async () => {
    const { live, offline } = await build();
    await live.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    live.records().forEach((record) => offline.observe(record));
    const revision = candidateOf({ query: "lamps", threshold: 15 }, 2);

    const other = await offline.offlineFirst({ ...requestFor(revision), candidateId: "candidate.other" });
    const moved = await offline.offlineFirst({ ...requestFor(revision), digest: "moved" });

    expect(other).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_request_mismatch" } });
    expect(moved).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_request_mismatch" } });
    expect(offline.offlineRecords()).toEqual([]);
  });
});
