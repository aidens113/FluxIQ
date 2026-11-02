import { expect, it } from "vitest";
import { recordingHarness } from "./harness.ts";
import { RecordingMessages as M } from "./messages.ts";

it("uses the approved address for creation, start ack, entries and Stop despite requested project overrides", async () => {
  const h = await recordingHarness();
  await h.sink.create({ projectId: "requested", recordingId: "recording.one", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "recording.one", projectId: "requested", description: "Observe a process" }));
  expect(h.sink.creates.map(input => input.projectId)).toEqual(["requested", "approved"]);
  const ack = h.gateway.outbound(h.session.sessionId).find(message => message.type === "server.start_recording");
  expect(ack?.payload).toMatchObject({ recordingId: "recording.one", projectId: "approved" });

  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "recording.one", projectId: "requested", entry: { type: "marker", label: "owned entry" } }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "recording.one", projectId: "requested", endedAt: Date.now() }));
  expect(h.sink.batches).toMatchObject([{ projectId: "approved", recordingId: "recording.one" }]);
  expect(h.sink.finalizations).toMatchObject([{ projectId: "approved", recordingId: "recording.one" }]);
  expect(h.sink.at("approved", "recording.one").timeline).toMatchObject([{ type: "marker", label: "owned entry" }]);
  expect(h.sink.at("requested", "recording.one").timeline).toEqual([]);
  expect(h.sink.at("requested", "recording.one").endedAt).toBeUndefined();
});

it("keeps late old IDs at their original address while a new recording is active in another project", async () => {
  const h = await recordingHarness();
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "old", description: "Observe the first process" }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "old" }));
  h.policy.context = () => ({ ok: true, projectId: "next-project" });
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "new", projectId: "attacker", description: "Observe the next process" }));
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "old", projectId: "next-project", entry: { type: "marker", label: "late old entry" } }));
  await h.gateway.receive(h.session.sessionId, M.event({ recordingId: "old", domainId: "example", eventType: "late", payload: { private: "old" } }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "old", projectId: "next-project" }));
  expect(h.sink.at("approved", "old").timeline).toEqual([]);
  expect(h.sink.finalizations.filter(input => input.recordingId === "old").map(input => input.projectId)).toEqual(["approved", "approved"]);
  expect(h.sink.at("next-project", "new").endedAt).toBeUndefined();
  expect(h.sink.at("next-project", "new").timeline).toEqual([]);
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "new", projectId: "attacker", entry: { type: "marker", label: "new entry" } }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "new", projectId: "attacker" }));
  expect(h.sink.at("next-project", "new").timeline).toMatchObject([{ label: "new entry" }]);
  expect(h.sink.batches.every(batch => batch.projectId !== "attacker")).toBe(true);
});

it("refuses unowned Stop and discards unowned entries without ending or writing the active recording", async () => {
  const h = await recordingHarness();
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "active", description: "Observe a process" }));
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "foreign", projectId: "approved", entry: { type: "marker", label: "foreign" } }));
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "foreign", projectId: "approved" }));
  expect(h.sink.finalizations).toEqual([]);
  expect(h.sink.batches).toEqual([]);
  expect(h.sink.at("approved", "active").endedAt).toBeUndefined();
  expect(h.gateway.outbound(h.session.sessionId)).toContainEqual(expect.objectContaining({ type: "server.error", payload: expect.objectContaining({ code: "recording.owner_required" }) }));
  await h.bridge.stopRecording(h.session.sessionId);
});
