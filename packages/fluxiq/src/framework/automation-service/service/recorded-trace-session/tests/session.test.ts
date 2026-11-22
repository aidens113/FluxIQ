import { afterEach, expect, it, vi } from "vitest";
import { AutomationStudioGatewayTraceReplaySources } from "../../../../../runtime/recording/gateway-trace/index.ts";
import { runAutomationStudioCandidateTrial } from "../../candidate-trial/index.ts";
import { candidateOf, offlineHarness, READ, requestFor, runOffline, type OfflineHarness } from "../../offline-trial/tests/offline-harness.ts";
import { runAutomationStudioRecordedTraceSession } from "../index.ts";

let harness: OfflineHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

it("runs only recorded scoped commands with derived provenance, while a live client remains attached", async () => {
  harness = await offlineHarness();
  const candidate = candidateOf({ query: "lamps", threshold: 10 });
  const recorded = await harness.recordLive(candidate);
  const liveBefore = harness.live.commands().length;
  const h = harness;
  const session = await runAutomationStudioRecordedTraceSession({ source: { store: h.store, traceId: recorded.traceId }, gateway: h.gateway }, async (environment) => {
    expect(environment.kind).toBe("trace");
    expect(AutomationStudioGatewayTraceReplaySources.current()).toEqual([recorded.traceId]);
    return await runAutomationStudioCandidateTrial(requestFor(candidate), { ...h.ports, environment, now: environment.now });
  });
  expect(session.status).toBe("ran");
  if (session.status !== "ran") throw new Error(`unexpected session ${session.status}`);
  expect(session.matcher.gaps).toEqual([]);
  expect(session.matcher.matchedOperations).toHaveLength(1);
  expect(h.live.commands()).toHaveLength(liveBefore);
  expect(h.localDispatches).toEqual([]);
  expect((await h.store.readManifest("trace.offline-2"))?.origin).toEqual({ kind: "derived", derivation: "replay", sourceTraceIds: [recorded.traceId] });
  expect(AutomationStudioGatewayTraceReplaySources.current()).toBeUndefined();
});

it("refuses missing and derived source before invoking the callback; trial exploration stays refused", async () => {
  harness = await offlineHarness();
  const candidate = candidateOf({ query: "lamps", threshold: 10 });
  const recorded = await harness.recordLive(candidate);
  await runOffline(harness, candidate, recorded.traceId);
  const run = vi.fn(async () => "must not run");
  for (const [traceId, reasonCode] of [["missing", "incomplete_capture"], ["trace.offline-2", "source_not_live"]]) {
    const result = await runAutomationStudioRecordedTraceSession({ source: { store: harness.store, traceId: traceId! }, gateway: harness.gateway }, run);
    expect(result).toMatchObject({ status: "refused", reasonCode });
  }
  expect(run).not.toHaveBeenCalled();
  expect(await runOffline(harness, candidate, recorded.traceId, "exploration")).toMatchObject({ status: "refused", reasonCode: "offline_not_allowed_in_phase" });
});

it("a changed command remains a strict divergence with no reevaluator or live fallback", async () => {
  harness = await offlineHarness();
  const candidate = candidateOf({ query: "lamps", threshold: 10 });
  const recorded = await harness.recordLive(candidate);
  const h = harness;
  const liveBefore = h.live.commands().length;
  const changed = candidateOf({ query: "changed", threshold: 10 });
  let consumedModelSuffix = 0;
  let cancelled = false;
  const result = await runAutomationStudioRecordedTraceSession({ source: { store: h.store, traceId: recorded.traceId }, gateway: h.gateway }, async (environment) => {
    environment.signal.addEventListener("abort", () => { cancelled = true; });
    try { await runAutomationStudioCandidateTrial(requestFor(changed, environment.signal), { ...h.ports, environment, now: environment.now }); } catch { /* normal recovery would next request a model */ }
    environment.assertSupported();
    consumedModelSuffix += 1;
  });
  expect(result.status).toBe("diverged");
  if (result.status !== "diverged") throw new Error("expected strict divergence");
  expect(consumedModelSuffix).toBe(0);
  expect(cancelled).toBe(true);
  expect(result.firstGap.ordinal).toBe(1);
  expect(result.matcher.gaps.length).toBeGreaterThan(0);
  expect(result.matcher.matchedOperations).toHaveLength(0);
  expect(h.live.commands()).toHaveLength(liveBefore);
});

it("settles and detaches on callback throw and clears derived-source context", async () => {
  harness = await offlineHarness();
  const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
  const disconnect = vi.spyOn(harness.gateway, "disconnect");
  await expect(runAutomationStudioRecordedTraceSession({ source: { store: harness.store, traceId: recorded.traceId }, gateway: harness.gateway }, async () => { throw new Error("synthetic_callback_failure"); })).rejects.toThrow("synthetic_callback_failure");
  expect(disconnect).toHaveBeenCalledWith(expect.any(String), "recorded_trace_session.ended");
  expect(AutomationStudioGatewayTraceReplaySources.current()).toBeUndefined();
});

it("checks a queued command's first gap after settling even when the callback has already returned", async () => {
  harness = await offlineHarness();
  const recorded = await harness.recordLive(candidateOf({ query: "lamps", threshold: 10 }));
  const h = harness;
  const attach = vi.spyOn(h.gateway, "attachScopedSession");
  let pending: Promise<unknown> | undefined;
  const outcome = await runAutomationStudioRecordedTraceSession({ source: { store: h.store, traceId: recorded.traceId }, gateway: h.gateway }, async () => {
    const session = attach.mock.results.at(-1)?.value;
    if (!session) throw new Error("no scoped matcher session");
    pending = h.gateway.executeAction(session.sessionId, { actionType: READ, parameters: { query: "changed" } }).result.catch(() => undefined);
  });
  await pending;
  expect(outcome.status).toBe("diverged");
  if (outcome.status !== "diverged") throw new Error("unsupported late result was accepted");
  expect(outcome.firstGap.ordinal).toBe(1);
});
