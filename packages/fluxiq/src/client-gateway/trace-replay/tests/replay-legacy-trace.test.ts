// P3 H: traces captured before the tap gave every event its session's
// reference and recorded delivered digests (round 4's live traces) are
// classified honestly by the harness itself. A legacy trace whose own events
// show one session is replayed with that session attached, declared as a
// normalization, and matches; a disposition under schema version 1 is compared
// on the fields it carries and leaves a capture gap for what it never recorded,
// while a real difference in those fields still diverges; a legacy trace that
// cannot be shown single-session is refused as capture gaps, the artifact list
// included, and never an intake defect. The stored trace is never changed.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ClientGatewayService, ClientGatewayTraceMemoryStore, replayClientGatewayTrace, type ClientGatewayTraceEvent, type ClientGatewayTraceJsonValue, type ClientGatewayTraceParityReport } from "../../index.ts";
import { clientMessage, openTrace, pairClient, traceScope, type OpenTrace } from "../../tests/trace-tap-support.ts";
import { copiedTraceStore, isClaimRecord, recordedTraceEvents, renumberedEvents } from "./trace-copy.ts";

const VERSION_ONE_GAP = "the disposition was recorded under schema version 1, which does not record what Core delivered for the message; every field it records matched";
const ONLY_SESSION = "session reference of a legacy single-session trace";

/** An action answered with a result that references an uploaded artifact, a state update, optionally an action whose answer never came, and a disconnect, recorded live. */
async function recordSession(traceId: string, options: { unanswered?: boolean } = {}): Promise<OpenTrace> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, trace: scope.source });
  const client = await pairClient(gateway, "client.legacy");
  const press = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", parameters: { value: 1 }, timeoutMs: 60_000 }));
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.state_update", { state: { step: "one" } })));
  const bytes = new TextEncoder().encode("<doc>legacy</doc>");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(gateway.receiveTraceArtifact(client.sessionId, { sha256, mediaType: "text/html", bytes })).toEqual({ status: "accepted", traces: 1 });
  const references = { artifacts: [{ sha256, mediaType: "text/html", byteLength: bytes.byteLength, role: "primary" }], unavailable: 0 };
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.action_result", { commandId: press.commandId, status: "succeeded", payload: { count: 1 }, metadata: { trace: references } })));
  await expect(press.result).resolves.toMatchObject({ status: "succeeded" });
  if (options.unanswered === true) {
    const waited = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.wait", timeoutMs: 20 }));
    await expect(waited.result).resolves.toMatchObject({ status: "timed_out" });
  }
  gateway.disconnect(client.sessionId, "socket closed");
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();
  return trace;
}

/** The trace as a capture before session references would have stored it: no reference on any event, and no claim record. */
function legacyEvents(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceEvent[] {
  return renumberedEvents(events.filter((event) => !isClaimRecord(event)).map(withoutSession));
}

/** A store holding the legacy `events`, its manifest's last sequence matching them (a legacy capture never had the claim record). */
async function legacyStore(trace: OpenTrace, events: readonly ClientGatewayTraceEvent[]): Promise<ClientGatewayTraceMemoryStore> {
  const store = await copiedTraceStore(trace, events);
  const manifest = await store.readManifest(trace.traceId);
  if (manifest === undefined) throw new Error("the copied trace has no manifest");
  await store.writeManifest({ ...manifest, completeness: { ...manifest.completeness, lastSequence: events.length } });
  return store;
}

function withoutSession(event: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  const { session: _session, ...rest } = event;
  return rest;
}

/** A disposition as the tap wrote it before delivered digests (schema version 1). */
function asVersionOne(event: ClientGatewayTraceEvent): ClientGatewayTraceEvent {
  if (event.kind !== "disposition" || event.payload.encoding !== "json" || event.payloadSchema === null) return event;
  const value: { [key: string]: ClientGatewayTraceJsonValue } = {};
  for (const [key, field] of Object.entries(event.payload.value as { readonly [key: string]: ClientGatewayTraceJsonValue })) if (key !== "delivered") value[key] = field;
  return { ...event, payloadSchema: { ...event.payloadSchema, version: "1" }, payload: { encoding: "json", value } };
}

function summary(report: ClientGatewayTraceParityReport): unknown {
  return report.divergences.map((divergence) => ({ sequence: divergence.sequence, kind: divergence.kind, class: divergence.class, fields: divergence.fields, detail: divergence.detail }));
}

describe("replaying a legacy trace", () => {
  it("attaches the one session a legacy trace shows it held, declares it, and matches without changing the stored trace", async () => {
    const trace = await recordSession("trace.legacy.single");
    const events = legacyEvents(await recordedTraceEvents(trace));
    const store = await legacyStore(trace, events);
    const report = await replayClientGatewayTrace({ store, traceId: trace.traceId });

    expect(summary(report)).toEqual([]);
    expect(report.verdict).toBe("matched");
    expect(report.sessionReferences).toEqual({ status: "single_session", checks: expect.arrayContaining(["no event names a session reference", "the outbound envelopes and lifecycle records name exactly one session id"]) });
    expect(report.normalizations.map((normalization) => normalization.field)).toContain(ONLY_SESSION);
    expect(report.entries.map((entry) => entry.status)).toEqual(events.map(() => "matched"));
    expect(events.some((event) => event.kind === "artifact")).toBe(true);
    const stored = await store.readEventRange(trace.traceId, 1, Number.MAX_SAFE_INTEGER);
    expect(stored.every((event) => event.session === undefined)).toBe(true);
  });

  it("leaves a current trace as recorded, with no legacy normalization", async () => {
    const trace = await recordSession("trace.legacy.current");
    const report = await replayClientGatewayTrace({ store: trace.store, traceId: trace.traceId });
    expect(report.verdict).toBe("matched");
    expect(report.sessionReferences).toEqual({ status: "recorded" });
    expect(report.normalizations.map((normalization) => normalization.field)).not.toContain(ONLY_SESSION);
  });

  it("compares a version 1 disposition on the fields it carries: what it never recorded is a capture gap at that point", async () => {
    const trace = await recordSession("trace.legacy.v1");
    const events = legacyEvents(await recordedTraceEvents(trace)).map(asVersionOne);
    const report = await replayClientGatewayTrace({ store: await legacyStore(trace, events), traceId: trace.traceId });
    const dispositions = events.filter((event) => event.kind === "disposition").map((event) => event.sequence);

    expect(dispositions.length).toBeGreaterThan(0);
    expect(summary(report)).toEqual(dispositions.map((sequence) => ({ sequence, kind: "disposition", class: "capture_gap", fields: ["payload.value.delivered"], detail: VERSION_ONE_GAP })));
    expect(report.entries.filter((entry) => entry.status === "matched")).toHaveLength(events.length - dispositions.length);
  });

  it("still reports a real difference in a field a version 1 disposition carries, classified as any other", async () => {
    const trace = await recordSession("trace.legacy.v1-changed");
    const events = legacyEvents(await recordedTraceEvents(trace)).map(asVersionOne);
    const changed = events.find((event) => event.kind === "disposition" && event.messageType === "client.action_result");
    if (changed === undefined || changed.payload.encoding !== "json") throw new Error("the recording has no action result disposition");
    const altered = events.map((event) => (event === changed ? { ...event, payload: { encoding: "json" as const, value: { ...(changed.payload as { value: { readonly [key: string]: ClientGatewayTraceJsonValue } }).value, disposition: "rejected" } } } : event));
    const report = await replayClientGatewayTrace({ store: await legacyStore(trace, altered), traceId: trace.traceId });

    const at = report.divergences.find((divergence) => divergence.sequence === changed.sequence);
    expect(at).toMatchObject({ class: "intake_defect", fields: ["payload.value.disposition"] });
    expect(report.divergences.filter((divergence) => divergence.sequence !== changed.sequence).every((divergence) => divergence.class === "capture_gap" && divergence.detail === VERSION_ONE_GAP)).toBe(true);
  });

  it("refuses a trace whose claim record and outcomes Core synthesized for unissued commands are capture gaps too", async () => {
    const trace = await recordSession("trace.legacy.refused-derived", { unanswered: true });
    let outbound = 0;
    const events = (await recordedTraceEvents(trace)).map(withoutSession).map((event) => {
      if (event.kind !== "outbound" || event.payload.encoding !== "json" || (outbound += 1) !== 1) return event;
      return { ...event, payload: { encoding: "json" as const, value: { ...(event.payload.value as { readonly [key: string]: ClientGatewayTraceJsonValue }), sessionId: "session.other" } } };
    });
    expect(events.some(isClaimRecord)).toBe(true);
    expect(events.some((event) => event.kind === "synthesized")).toBe(true);
    const report = await replayClientGatewayTrace({ store: await copiedTraceStore(trace, events), traceId: trace.traceId });

    expect(report.sessionReferences.status).toBe("refused");
    expect(report.divergences.filter((divergence) => divergence.class !== "capture_gap")).toEqual([]);
    expect(report.divergences.map((divergence) => divergence.kind)).toEqual(expect.arrayContaining(["lifecycle", "synthesized"]));
  });

  it("refuses a legacy trace that cannot be shown to hold one session: capture gaps that say why, the artifact list included, never an intake defect", async () => {
    const trace = await recordSession("trace.legacy.two-sessions");
    let outbound = 0;
    const events = legacyEvents(await recordedTraceEvents(trace)).map((event) => {
      if (event.kind !== "outbound" || event.payload.encoding !== "json" || (outbound += 1) !== 1) return event;
      return { ...event, payload: { encoding: "json" as const, value: { ...(event.payload.value as { readonly [key: string]: ClientGatewayTraceJsonValue }), sessionId: "session.other" } } };
    });
    const report = await replayClientGatewayTrace({ store: await legacyStore(trace, events), traceId: trace.traceId });
    const reason = "its outbound envelopes and lifecycle records name more than one session id";

    expect(report.sessionReferences).toEqual({ status: "refused", reason });
    expect(report.normalizations.map((normalization) => normalization.field)).not.toContain(ONLY_SESSION);
    expect(report.divergences.length).toBeGreaterThan(0);
    expect(report.divergences.every((divergence) => divergence.class === "capture_gap")).toBe(true);
    expect(report.entries.filter((entry) => entry.status === "matched")).toEqual([]);
    expect(report.divergences.find((divergence) => divergence.fields.includes("manifest.artifacts"))).toMatchObject({ class: "capture_gap", detail: expect.stringContaining(reason) });
    expect(new Set(report.divergences.filter((divergence) => divergence.sequence !== null).map((divergence) => divergence.detail))).toEqual(
      new Set([`the event does not say which session it belongs to, and the trace cannot be shown to hold one session: ${reason}`])
    );
  });
});
