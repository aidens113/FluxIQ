import { expect, it, vi } from "vitest";
import { defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { scopedCaptureFixture } from "./fixture.ts";

function registry() {
  const io = new IoRegistry();
  const project = vi.fn(() => ({ retained: "actual projected payload" }));
  const dispatch = vi.fn(() => ({ ok: true, outputId: "activate" }));
  for (const domain of ["alpha", "beta"]) {
    io.registerOutput(domain, defineOutput({ definition: { id: "activate", title: "Activate" }, mode: "request", dispatch }));
    io.registerInput(domain, defineInput({ definition: { id: "bound", title: "Bound", role: "action", outputId: "activate" }, mode: "stream", outputBinding: { outputId: "activate", toPayload: project } }));
    io.registerInput(domain, defineInput({ definition: { id: "state", title: "State", role: "state" }, mode: "stream" }));
  }
  return { io, project, dispatch };
}

it.each(["event", "metadata", "malformed"] as const)("rejects a foreign %s domain before an actual IO projector", async supplied => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin();
  await f.state.appendRecordingEvent(f.session, { recordingId: "owned", domainId: supplied === "event" ? "beta" : "alpha", eventType: "signal", metadata: { inputId: "bound", ...(supplied !== "event" ? { domainId: supplied === "metadata" ? "beta" : 42 } : {}) } }, "foreign");
  expect(r.project).not.toHaveBeenCalled();
  expect(r.dispatch).not.toHaveBeenCalled();
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  expect(f.gateway.outbound(f.session.sessionId)).toContainEqual(expect.objectContaining({ type: "server.error", payload: expect.objectContaining({ code: "recording.event_rejected" }) }));
  await f.gateway.close();
});

it.each(["domainId", "metadata"] as const)("discards foreign state %s before projection or observation write", async location => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin();
  await f.state.appendStateUpdate(f.session, { ...(location === "domainId" ? { domainId: "beta" } : {}), state: { retained: true }, metadata: { inputId: "bound", ...(location === "metadata" ? { domainId: "beta" } : {}) } }, "foreign.state");
  await f.state.writeOrder.flush(f.owner);
  expect(r.project).not.toHaveBeenCalled();
  expect(r.dispatch).not.toHaveBeenCalled();
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  expect(f.gateway.snapshot().auditLog).toContainEqual(expect.objectContaining({ type: "recording.event_discarded", metadata: expect.objectContaining({ executable: false }) }));
  await f.gateway.close();
});

it("checks the original stored domain even for a direct gateway input call", async () => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin();
  expect(await f.state.recordGatewayInput({ active: { projectId: "approved", recordingId: "owned", domainId: "alpha" }, domainId: "beta", inputId: "bound", payload: { retained: true }, sourceId: "fixture", messageId: "foreign", sender: { session: f.session, message: { kind: "recording event", label: "signal", domainId: "beta", inputId: "bound" } } })).toBe(true);
  expect(r.project).not.toHaveBeenCalled();
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("discards an unowned event without guessing its supplied domain's projector", async () => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin();
  await f.state.appendRecordingEvent(f.session, { recordingId: "foreign", domainId: "beta", eventType: "signal", metadata: { inputId: "bound" } }, "unowned");
  expect(f.calls.selected).toEqual([]);
  expect(r.project).not.toHaveBeenCalled();
  expect(r.dispatch).not.toHaveBeenCalled();
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("preserves matching bound action projection while state evidence stays passive", async () => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin();
  await f.state.appendRecordingEvent(f.session, { domainId: "alpha", eventType: "signal", payload: { original: "event" }, metadata: { inputId: "bound" } }, "matching");
  expect(r.project).toHaveBeenCalledTimes(1);
  await f.state.appendStateUpdate(f.session, { state: { original: "state" }, metadata: { domainId: "alpha", inputId: "bound" } }, "passive");
  await f.state.appendStateUpdate(f.session, { state: { original: "state-input" }, metadata: { domainId: "alpha", inputId: "state" } }, "state-input");
  await f.state.writeOrder.flush(f.owner);
  expect(r.project).toHaveBeenCalledTimes(1);
  expect(r.dispatch).not.toHaveBeenCalled();
  const timeline = f.sink.at("approved", "owned").timeline;
  expect(timeline.map(entry => entry.type)).toEqual(["action", "observation", "observation"]);
  expect(timeline[0]).toMatchObject({ outputId: "activate", parameters: { retained: "actual projected payload" }, metadata: { domainId: "alpha", policyEligible: true } });
  expect(timeline[1]).toMatchObject({ observationType: "client.state_update", payload: { state: { original: "state" } } });
  expect(timeline[2]).toMatchObject({ metadata: { inputRole: "state", policyEligible: false } });
  await f.gateway.close();
});

it("keeps an explicit null domain passive and never adopts a supplied IO domain", async () => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  await f.begin("approved", "owned", null);
  await f.entry("owned", { type: "marker", label: "passive owner" });
  await f.state.appendStateUpdate(f.session, { state: { original: true } }, "passive");
  await f.state.appendRecordingEvent(f.session, { domainId: "alpha", eventType: "signal", metadata: { inputId: "bound" } }, "foreign");
  await f.state.appendStateUpdate(f.session, { state: {}, metadata: { domainId: "alpha", inputId: "bound" } }, "foreign.state");
  await f.state.writeOrder.flush(f.owner);
  expect(r.project).not.toHaveBeenCalled();
  expect(r.dispatch).not.toHaveBeenCalled();
  expect(f.calls.selected[0]?.recording.environment.domainId).toBeNull();
  expect(f.sink.at("approved", "owned").timeline.map(entry => entry.type)).toEqual(["marker", "observation"]);
  await f.gateway.close();
});

it("refuses a stored-domain mismatch before a matching-looking event reaches IO", async () => {
  const r = registry();
  const f = await scopedCaptureFixture({ io: r.io });
  const recording = await f.begin();
  recording.environment.domainId = "beta";
  await expect(f.state.appendRecordingEvent(f.session, { domainId: "alpha", eventType: "signal", metadata: { inputId: "bound" } }, "corrupt")).rejects.toThrow("recording.domain_scope_refused");
  expect(r.project).not.toHaveBeenCalled();
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  await f.gateway.close();
});
