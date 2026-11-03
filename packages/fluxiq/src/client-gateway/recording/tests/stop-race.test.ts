import { afterEach, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { RecordingBridgeState } from "../internal/index.ts";
import { recordingHarness } from "./harness.ts";
import { RecordingMessages as M } from "./messages.ts";

const gateways: Awaited<ReturnType<typeof recordingHarness>>["gateway"][] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(gateways.splice(0).map(gateway => gateway.close()));
});

async function fixture() {
  const h = await recordingHarness();
  gateways.push(h.gateway);
  const original = Object.getOwnPropertyDescriptor(h.bridge, "state")?.value;
  if (!(original instanceof RecordingBridgeState)) throw new Error("Expected the original bridge state.");
  const state = original as RecordingBridgeState<JsonObject, JsonObject>;
  const session = state.session(h.session.sessionId);
  const owner = state.recordingOwnerKey(session);
  h.policy.context = () => ({ ok: true, projectId: "project.P" });
  await h.gateway.receive(session.sessionId, M.start({ recordingId: "same-id", description: "Observe the original process" }));
  return { ...h, state, session, owner };
}

function pause() {
  let release!: () => void;
  let entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  return { wait, reached, release, entered };
}

it.each(["host", "client"] as const)("keeps Q active when a held %s Stop finishes P with the same recording ID", async origin => {
  const f = await fixture();
  const held = pause();
  const finalize = f.sink.finalize;
  const gatewayStop = vi.spyOn(f.gateway, "stopRecording");
  vi.spyOn(f.sink, "finalize").mockImplementation(async function (this: typeof f.sink, input) {
    expect(this).toBe(f.sink);
    const original = finalize.call(f.sink, input);
    if (input.projectId === "project.P") {
      held.entered();
      await held.wait;
    }
    return await original;
  });
  const stopping = origin === "host" ? f.bridge.stopRecording(f.session.sessionId) : f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id", projectId: "unowned", endedAt: 100 }));
  try {
    await held.reached;
    f.policy.context = () => ({ ok: true, projectId: "project.Q" });
    await f.gateway.receive(f.session.sessionId, M.start({ recordingId: "same-id", projectId: "unowned", description: "Observe the newer process" }));
    const newer = f.state.activeRecordings.get(f.owner);
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "Q before old Stop" } }));
    await f.state.writeOrder.flush(f.owner);
    held.release();
    await stopping;
    expect(f.state.activeRecordings.get(f.owner)).toBe(newer);
    expect(f.state.closedRecordings.get(f.owner)).toBeUndefined();
    expect(f.sink.at("project.P", "same-id").endedAt).toBeDefined();
    expect(f.sink.at("project.P", "same-id").timeline).toEqual([]);
    expect(f.sink.at("project.Q", "same-id").endedAt).toBeUndefined();
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", projectId: "project.P", entry: { type: "marker", label: "Q after old Stop" } }));
    await f.state.writeOrder.flush(f.owner);
    expect(f.sink.at("project.Q", "same-id").timeline).toMatchObject([{ label: "Q before old Stop" }, { label: "Q after old Stop" }]);
    expect(f.sink.finalizations).toEqual([{ projectId: "project.P", recordingId: "same-id", ...(origin === "client" ? { endedAt: 100 } : {}) }]);
    if (origin === "host") expect(gatewayStop.mock.calls).toEqual([[f.session.sessionId, "same-id"]]);
  } finally {
    held.release();
    await stopping;
  }
});

it.each(["host", "client"] as const)("retains Q's newer closed row and counters after a held %s Stop of P returns", async origin => {
  const f = await fixture();
  const held = pause();
  const finalize = f.sink.finalize;
  vi.spyOn(f.sink, "finalize").mockImplementation(async function (this: typeof f.sink, input) {
    expect(this).toBe(f.sink);
    const original = finalize.call(f.sink, input);
    if (input.projectId === "project.P") {
      held.entered();
      await held.wait;
    }
    return await original;
  });
  const stopping = origin === "host" ? f.bridge.stopRecording(f.session.sessionId) : f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id", projectId: "project.Q" }));
  try {
    await held.reached;
    f.policy.context = () => ({ ok: true, projectId: "project.Q" });
    await f.gateway.receive(f.session.sessionId, M.start({ recordingId: "same-id", description: "Observe the newer process" }));
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "Q captured" } }));
    await f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id", projectId: "project.P" }));
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "late Q" } }));
    const newer = f.state.closedRecordings.get(f.owner)!;
    expect(newer.projectId).toBe("project.Q");
    expect(newer.discardedEvents).toBe(1);
    const finalizedAt = newer.finalizedAt;
    held.release();
    await stopping;
    expect(f.state.activeRecordings.has(f.owner)).toBe(false);
    expect(f.state.closedRecordings.get(f.owner)).toBe(newer);
    expect(newer.projectId).toBe("project.Q");
    expect(newer.finalizedAt).toBe(finalizedAt);
    expect(newer.discardedEvents).toBe(1);
    expect(f.sink.at("project.P", "same-id").timeline).toEqual([]);
    expect(f.sink.at("project.Q", "same-id").timeline).toMatchObject([{ label: "Q captured" }]);
    expect(f.sink.finalizations.map(input => input.projectId)).toEqual(["project.P", "project.Q"]);
  } finally {
    held.release();
    await stopping;
  }
});

it.each(["host", "client"] as const)("keeps a fresh original ref even at the same address after the old %s Stop", async origin => {
  const f = await fixture();
  const first = f.state.activeRecordings.get(f.owner);
  const held = pause();
  const finalize = f.sink.finalize;
  let calls = 0;
  vi.spyOn(f.sink, "finalize").mockImplementation(async function (this: typeof f.sink, input) {
    expect(this).toBe(f.sink);
    const original = finalize.call(f.sink, input);
    if (++calls === 1) {
      held.entered();
      await held.wait;
    }
    return await original;
  });
  const stopping = origin === "host" ? f.bridge.stopRecording(f.session.sessionId) : f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id" }));
  try {
    await held.reached;
    await f.gateway.receive(f.session.sessionId, M.start({ recordingId: "same-id", description: "Observe a fresh original recording" }));
    const newer = f.state.activeRecordings.get(f.owner);
    expect(newer).not.toBe(first);
    held.release();
    await stopping;
    expect(f.state.activeRecordings.get(f.owner)).toBe(newer);
    expect(f.sink.at("project.P", "same-id").endedAt).toBeUndefined();
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "fresh ref captured" } }));
    await f.state.writeOrder.flush(f.owner);
    expect(f.sink.at("project.P", "same-id").timeline).toMatchObject([{ label: "fresh ref captured" }]);
  } finally {
    held.release();
    await stopping;
  }
});

it("retains same-address diagnostic counters and upgrades finalization only after actual successful Stop", async () => {
  const f = await fixture();
  f.state.rememberClosedRecording(f.owner, { projectId: "project.P", recordingId: "same-id" }, false);
  const original = f.state.closedRecordings.get(f.owner)!;
  f.state.noteDiscardedClientMessage(f.session, { kind: "recording entry", label: "original diagnostic", recordingId: "same-id", executable: true });
  expect(original).toMatchObject({ discardedEvents: 1, discardedActions: 1, reported: true });
  expect(original.finalizedAt).toBeUndefined();
  await f.bridge.stopRecording(f.session.sessionId);
  expect(f.state.closedRecordings.get(f.owner)).toBe(original);
  expect(original).toMatchObject({ projectId: "project.P", discardedEvents: 1, discardedActions: 1, reported: true });
  expect(original.finalizedAt).toBeDefined();
  expect(f.sink.at("project.P", "same-id").endedAt).toBeDefined();
});

it("does not retain another project's same-ID address or counters when Q really closes", async () => {
  const f = await fixture();
  await f.bridge.stopRecording(f.session.sessionId);
  const previous = f.state.closedRecordings.get(f.owner)!;
  f.state.noteDiscardedClientMessage(f.session, { kind: "recording entry", label: "P diagnostic", recordingId: "same-id", executable: true });
  f.policy.context = () => ({ ok: true, projectId: "project.Q" });
  await f.gateway.receive(f.session.sessionId, M.start({ recordingId: "same-id", description: "Observe another project" }));
  await f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id", projectId: "project.P" }));
  const current = f.state.closedRecordings.get(f.owner)!;
  expect(current).not.toBe(previous);
  expect(current).toMatchObject({ projectId: "project.Q", recordingId: "same-id", discardedEvents: 0, discardedActions: 0, reported: false });
  expect(previous).toMatchObject({ projectId: "project.P", discardedEvents: 1, discardedActions: 1 });
  expect(f.sink.finalizations.map(input => input.projectId)).toEqual(["project.P", "project.Q"]);
});

it.each([
  { latest: "active", retained: false },
  { latest: "active", retained: true },
  { latest: "closed", retained: false },
  { latest: "closed", retained: true }
] as const)("keeps P's failed-append diagnostics at P while Q is $latest, original counters $retained", async ({ latest, retained }) => {
  const f = await fixture();
  const originalAddress = f.state.activeRecordings.get(f.owner)!;
  if (retained) {
    f.state.rememberClosedRecording(f.owner, originalAddress, false);
    f.state.noteDiscardedClientMessage(f.session, { kind: "recording entry", label: "earlier P diagnostic", recordingId: "same-id", executable: true });
  }
  const originalClosed = f.state.closedRecordings.get(f.owner);
  const held = pause();
  const append = f.sink.append;
  const failure = new Error("Original P append failure");
  const input = { projectId: "project.P", recordingId: "same-id", entry: { type: "marker" as const, label: "held P append" } };
  vi.spyOn(f.sink, "append").mockImplementation(async function (this: typeof f.sink, actual) {
    expect(this).toBe(f.sink);
    expect(actual).toBe(input);
    held.entered();
    await held.wait;
    return await append.call(f.sink, actual);
  });
  const result = f.state.appendOrDiscard(originalAddress, [{ session: f.session, message: { kind: "recording entry", label: "held P append", recordingId: "same-id", executable: true } }], () => f.sink.append(input));
  try {
    await held.reached;
    await f.sink.finalize({ projectId: "project.P", recordingId: "same-id" });
    f.policy.context = () => ({ ok: true, projectId: "project.Q" });
    await f.gateway.receive(f.session.sessionId, M.start({ recordingId: "same-id", description: "Observe the next project" }));
    await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "Q captured" } }));
    await f.state.writeOrder.flush(f.owner);
    const newerActive = f.state.activeRecordings.get(f.owner);
    if (latest === "closed") {
      await f.gateway.receive(f.session.sessionId, M.stop({ recordingId: "same-id" }));
      await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "late Q" } }));
    }
    const newerClosed = f.state.closedRecordings.get(f.owner);
    const qCounts = newerClosed?.discardedEvents;
    f.sink.appendError = failure;
    held.release();
    expect(await result).toEqual({ kind: "discarded", cause: failure });
    f.sink.appendError = undefined;
    const expectedCount = retained ? 2 : 1;
    if (retained) {
      expect(originalClosed).toMatchObject({ projectId: "project.P", discardedEvents: expectedCount, discardedActions: expectedCount });
      expect(originalClosed?.finalizedAt).toBeDefined();
    }
    const discarded = f.gateway.snapshot().auditLog.filter(event => event.type === "recording.action_discarded").at(-1);
    expect(discarded?.metadata).toMatchObject({ projectId: "project.P", recordingId: "same-id", discardedEvents: expectedCount, discardedActions: expectedCount });
    if (latest === "closed") {
      expect(f.state.closedRecordings.get(f.owner)).toBe(newerClosed);
      expect(newerClosed).toMatchObject({ projectId: "project.Q", discardedEvents: qCounts, discardedActions: 0 });
    } else {
      expect(f.state.activeRecordings.get(f.owner)).toBe(newerActive);
      expect(f.state.closedRecordings.get(f.owner)?.projectId).toBe("project.P");
      expect(f.sink.at("project.Q", "same-id").endedAt).toBeUndefined();
      await f.gateway.receive(f.session.sessionId, M.entry({ recordingId: "same-id", entry: { type: "marker", label: "Q still captured" } }));
      await f.state.writeOrder.flush(f.owner);
      expect(f.sink.at("project.Q", "same-id").timeline).toMatchObject([{ label: "Q captured" }, { label: "Q still captured" }]);
    }
    expect(f.sink.at("project.P", "same-id").timeline).toEqual([]);
  } finally {
    held.release();
    await result;
    f.sink.appendError = undefined;
  }
});
