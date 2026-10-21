// P4 session view and unreached client. An offline trial's matcher session is
// attached with the view the source trace recorded, else with the view the
// caller supplies (declared in the outcome as a normalization), never a
// supplied one over a recorded one; with neither the trial is refused before
// anything runs. A run whose commands never reached the recorded client while
// the trace recorded some is inconclusive (`missing_transition`), never a
// fail, and an inconclusive result never marks its assertion violated.
import { afterEach, describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore, type ClientGatewayClientHello, type ClientGatewayTraceEvent } from "../../../../../../client-gateway/index.ts";
import { candidateOf, offlineHarness, runOffline, type OfflineHarness } from "./offline-harness.ts";

let harness: OfflineHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

/** A view that serves the candidate's read, unlike the recorded one in name. */
const SERVING: ClientGatewayClientHello = {
  clientType: "custom",
  name: "Supplied client",
  capabilities: [{ id: "example.actions", kind: "action", actionTypes: ["example.read"], metadata: { domainId: "example" } }],
  metadata: { domainId: "example" }
};

/** A view that serves nothing: what the matcher used to attach by default. */
const SERVES_NOTHING: ClientGatewayClientHello = { clientType: "custom" };

function isClaimRecord(event: ClientGatewayTraceEvent): boolean {
  return event.kind === "lifecycle" && event.messageType === "session.claimed";
}

/** A copy of `traceId` (which holds no artifact) in a fresh store without its claim records, numbered again, its last sequence lowered to match: a trace captured before they existed. */
async function withoutClaims(source: ClientGatewayTraceMemoryStore, traceId: string): Promise<ClientGatewayTraceMemoryStore> {
  const copy = new ClientGatewayTraceMemoryStore();
  const events = await source.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
  expect(events.some(isClaimRecord)).toBe(true);
  const kept = events.filter((event) => !isClaimRecord(event)).map((event, index) => ({ ...event, sequence: index + 1 }));
  expect(await source.listArtifacts(traceId)).toEqual([]);
  await copy.appendEvents(traceId, kept);
  const manifest = await source.readManifest(traceId);
  if (manifest === undefined) throw new Error("the recorded trace has no manifest");
  await copy.writeManifest({ ...manifest, completeness: { ...manifest.completeness, lastSequence: kept.length } });
  return copy;
}

async function recorded() {
  harness = await offlineHarness();
  const candidate = candidateOf({ query: "lamps", threshold: 10 });
  const live = await harness.recordLive(candidate);
  return { harness, candidate, traceId: live.traceId };
}

describe("an offline trial's session view", () => {
  it("is the view the trace recorded, and a supplied view never overrides it", async () => {
    const { harness, candidate, traceId } = await recorded();

    const offline = await runOffline(harness, candidate, traceId, "test", { sessionView: SERVES_NOTHING });

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.sessionView).toBe("recorded");
    expect(offline.normalizations).toEqual([]);
    expect(offline.supported).toEqual({ matchedOperations: 1, recordedOperations: 1 });
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path" });
  });

  it("is the supplied view when the trace recorded none, declared as a normalization", async () => {
    const { harness, candidate, traceId } = await recorded();
    const store = await withoutClaims(harness.store, traceId);

    const offline = await runOffline(harness, candidate, traceId, "test", { store, sessionView: SERVING });

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.sessionView).toBe("supplied");
    expect(offline.normalizations).toEqual([{ field: "session view", reason: expect.stringContaining("supplied") }]);
    expect(offline.supported).toEqual({ matchedOperations: 1, recordedOperations: 1 });
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.evidence).toMatchObject({ verdict: "pass", scope: "full_recorded_path", missingEvidence: [] });
  });

  it("is refused before anything runs when the trace recorded none and the caller supplied none", async () => {
    const { harness, candidate, traceId } = await recorded();
    const store = await withoutClaims(harness.store, traceId);
    const judged = harness.judged.length;

    const refused = await runOffline(harness, candidate, traceId, "test", { store });

    expect(refused).toEqual({ status: "refused", reasonCode: "incomplete_capture", detail: expect.stringContaining("session view") });
    expect(harness.judged).toHaveLength(judged);
    expect(await harness.store.readManifest("trace.offline-2")).toBeUndefined();
    expect(harness.live.commands()).toHaveLength(1);
    expect(harness.localDispatches).toEqual([]);
  });
});

describe("an offline trial whose commands never reached the recorded client", () => {
  it("is inconclusive under missing_transition, its assertion unverified, never a fail", async () => {
    const { harness, candidate, traceId } = await recorded();
    const store = await withoutClaims(harness.store, traceId);

    const offline = await runOffline(harness, candidate, traceId, "test", { store, sessionView: SERVES_NOTHING });

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.sessionView).toBe("supplied");
    expect(offline.matcher.matchedOperations).toEqual([]);
    expect(offline.matcher.gaps).toEqual([]);
    expect(offline.supported).toEqual({ matchedOperations: 0, recordedOperations: 1 });
    expect(offline.trial.result.verdict).toBe("execution_failed");
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      scope: "segment",
      reasonCodes: ["missing_transition"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "unverified" }],
      missingEvidence: [{ reasonCode: "missing_transition", scope: "segment", operation: null, detail: expect.stringContaining("no operation reached the recorded client") }]
    });
    expect(offline.evidence.missingEvidence[0]!.detail).toContain("0 of 1");
  });
});

describe("an inconclusive offline trial's assertion", () => {
  it("is unverified, not violated, when the run failed on a gap", async () => {
    const { harness, traceId } = await recorded();

    const offline = await runOffline(harness, candidateOf({ query: "desks", threshold: 10 }, 2), traceId);

    if (offline.status !== "ran") throw new Error(`refused: ${offline.reasonCode}`);
    expect(offline.trial.result.verdict).toBe("execution_failed");
    expect(offline.supported).toEqual({ matchedOperations: 0, recordedOperations: 1 });
    expect(offline.evidence).toMatchObject({
      verdict: "inconclusive",
      reasonCodes: ["argument_mismatch"],
      assertionsChecked: [{ id: "build_test_judge.task_goal", outcome: "unverified" }]
    });
  });
});
