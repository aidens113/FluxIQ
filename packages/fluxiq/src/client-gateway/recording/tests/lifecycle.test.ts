import { expect, it, vi } from "vitest";
import { recordingHarness } from "./harness.ts";
import { RecordingMessages as M } from "./messages.ts";

it("holds messages received during pending approval and suppresses a stale Start acknowledgement after Stop", async () => {
  const h = await recordingHarness();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const approving = new Promise<void>(resolve => { entered = resolve; });
  h.policy.context = async () => {
    entered();
    await gate;
    return { ok: true, projectId: "approved" };
  };
  const starting = h.gateway.receive(h.session.sessionId, M.start({ recordingId: "pending", description: "Observe a process" }));
  await approving;
  const entry = h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "pending", entry: { type: "marker", label: "during approval" } }));
  const stopping = h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "pending" }));
  expect(h.sink.creates).toEqual([]);
  release();
  await Promise.all([starting, entry, stopping]);
  expect(h.sink.at("approved", "pending").timeline).toMatchObject([{ label: "during approval" }]);
  expect(h.sink.at("approved", "pending").endedAt).toBeDefined();
  expect(h.gateway.outbound(h.session.sessionId).filter(message => message.type === "server.start_recording")).toEqual([]);
});

it.each(["client", "host"] as const)("keeps the new active address when %s Stop is finishing the old recording", async origin => {
  const h = await recordingHarness();
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "old", description: "Observe the first process" }));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const finalizing = new Promise<void>(resolve => { entered = resolve; });
  const original = h.sink.finalize;
  vi.spyOn(h.sink, "finalize").mockImplementation(async input => {
    if (input.recordingId === "old") {
      entered();
      await gate;
    }
    return original.call(h.sink, input);
  });
  const stopping = origin === "client" ? h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "old" })) : h.bridge.stopRecording(h.session.sessionId);
  await finalizing;
  h.policy.context = () => ({ ok: true, projectId: "new-project" });
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "new", description: "Observe the next process" }));
  release();
  await stopping;
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "new", entry: { type: "marker", label: "still new" } }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "new" }));
  expect(h.sink.at("approved", "old").endedAt).toBeDefined();
  expect(h.sink.at("new-project", "new").timeline).toMatchObject([{ label: "still new" }]);
  expect(h.sink.at("new-project", "new").endedAt).toBeDefined();
});

it("keeps the shared rich initial snapshot intact and refuses malformed snapshots before creation or acknowledgement", async () => {
  const h = await recordingHarness();
  const snapshot = {
    id: "captured-state", timestamp: 4,
    namespaces: { machine: { schemaId: "machine.state", schemaVersion: "0.1", values: { ready: { type: "boolean", value: true, observedAt: 4, metadata: { origin: "capture" } } } } },
    presentation: { visualFrames: [{ id: "frame", coordinateSpace: { width: 20, height: 10, unit: "cell" }, layers: [{ id: "status", kind: "text", content: "Ready", anchor: { type: "entity", entityId: "control.ready", entityKind: "indicator" }, metadata: { retained: true } }] }] }
  };
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "rich", description: "Observe a process", initialState: snapshot }));
  expect(h.sink.at("approved", "rich").initialState).toBe(snapshot);
  expect(h.sink.at("approved", "rich").initialState).toEqual(snapshot);
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "rich" }));
  const created = h.sink.creates.length;
  const acks = h.gateway.outbound(h.session.sessionId).filter(message => message.type === "server.start_recording").length;
  await expect(h.gateway.receive(h.session.sessionId, M.start({ recordingId: "malformed", description: "Observe a process", initialState: { timestamp: 5, namespaces: [], presentation: snapshot.presentation } }))).rejects.toThrow("recording.invalid_initial_state");
  expect(h.sink.creates).toHaveLength(created);
  expect(h.gateway.outbound(h.session.sessionId).filter(message => message.type === "server.start_recording")).toHaveLength(acks);
});
