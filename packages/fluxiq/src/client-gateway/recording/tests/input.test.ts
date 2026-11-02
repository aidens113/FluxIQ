import { expect, it, vi } from "vitest";
import { defineInput, defineOutput, IoRegistry } from "../../../io/index.ts";
import { recordingHarness } from "./harness.ts";
import { RecordingMessages as M } from "./messages.ts";

it("records only bound actions as executable and never projects discarded inputs", async () => {
  const io = new IoRegistry();
  const projector = vi.fn(() => ({ value: "command" }));
  const dispatch = vi.fn(() => ({ ok: true, outputId: "activate" }));
  io.registerOutput("example", defineOutput({ definition: { id: "activate", title: "Activate" }, mode: "request", dispatch }));
  io.registerInput("example", defineInput({ definition: { id: "state", title: "State", role: "state" }, mode: "stream" }));
  io.registerInput("example", defineInput({ definition: { id: "unmapped", title: "Unmapped", role: "action" }, mode: "stream" }));
  io.registerInput("example", defineInput({ definition: { id: "definition-only", title: "Definition only", role: "action", outputId: "activate" }, mode: "stream" }));
  io.registerInput("example", defineInput({ definition: { id: "bound", title: "Bound", role: "action", outputId: "activate" }, mode: "stream", outputBinding: { outputId: "activate", toPayload: projector } }));
  const h = await recordingHarness({ io });
  await h.bridge.startRecording({ sessionId: h.session.sessionId, recordingId: "input", domainId: "example", description: "Observe a process" });
  for (const id of ["state", "unmapped", "definition-only", "bound"]) {
    await h.gateway.receive(h.session.sessionId, M.event({ domainId: "example", eventType: "signal", payload: { id }, metadata: { inputId: id } }));
  }
  const stored = h.sink.at("approved", "input");
  expect(stored.timeline.map(entry => entry.type)).toEqual(["observation", "observation", "observation", "action"]);
  expect(stored.timeline.map(entry => entry.metadata?.policyEligible)).toEqual([false, false, false, true]);
  expect(projector).toHaveBeenCalledTimes(1);
  await h.bridge.stopRecording(h.session.sessionId);
  projector.mockClear();
  for (const id of ["state", "unmapped", "definition-only", "bound", "bound"]) {
    await h.gateway.receive(h.session.sessionId, M.event({ domainId: "example", eventType: "signal", payload: { id }, metadata: { inputId: id } }));
  }
  const discarded = h.gateway.snapshot().auditLog.filter(entry => entry.type.endsWith("_discarded"));
  expect(discarded.map(entry => entry.type)).toEqual(["recording.event_discarded", "recording.action_discarded", "recording.action_discarded"]);
  expect(discarded[0]?.metadata?.executable).toBe(false);
  expect(discarded.at(-1)?.metadata).toMatchObject({ discardedActions: 2, discardedEvents: 5 });
  expect(projector).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(h.sink.at("approved", "input").timeline).toHaveLength(4);
});
