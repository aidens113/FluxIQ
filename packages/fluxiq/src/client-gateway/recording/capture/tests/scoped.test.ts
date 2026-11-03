import { afterEach, expect, it, vi } from "vitest";
import type { ClientGatewayActionCommand, ClientGatewayActionResult } from "../../../contracts.ts";
import { scopedCaptureFixture } from "./fixture.ts";

afterEach(() => vi.restoreAllMocks());

it("preserves legacy one-argument receivers without introducing a sink read", async () => {
  const f = await scopedCaptureFixture({ legacy: true });
  await f.begin();
  const read = vi.spyOn(f.sink, "read");
  const raw = { type: "marker", label: "legacy" };
  await f.entry("owned", raw);
  const target = { original: "target" };
  await f.state.appendActionResult(f.session.sessionId, { actionType: "activate", target }, { commandId: "command", status: "succeeded", startedAt: 2 });
  expect(read).not.toHaveBeenCalled();
  expect(f.calls.legacy).toEqual([{ receiver: f.ingress, args: [raw] }, { receiver: f.ingress, args: [target] }]);
  expect(f.calls.selected).toEqual([]);
  expect(f.sink.at("approved", "owned").timeline).toHaveLength(2);
  await f.gateway.close();
});

it("uses the original addressed recording and receiver, ignoring foreign wire project and target metadata", async () => {
  const f = await scopedCaptureFixture();
  await f.sink.create({ projectId: "decoy", recordingId: "owned", startedAt: 1, environment: { domainId: "beta" }, initialState: { timestamp: 1, namespaces: {} } });
  const original = await f.begin();
  const raw = { type: "action", actionType: "activate", parameters: { retained: [] }, origin: "operator", startedAt: 2, target: { domain: "alpha", metadata: { domainId: "beta" } }, result: { status: "unknown", evidence: [{ retained: "full evidence" }], metadata: { original: true } } };
  await f.entry("owned", raw, "decoy");
  await f.state.writeOrder.flush(f.owner);
  expect(f.calls.selected).toEqual([{ receiver: f.scoped, args: [original], recording: original }]);
  expect(f.calls.entries[0]?.args).toEqual([raw]);
  expect(f.calls.entries[0]?.args[0]).toBe(raw);
  expect(f.calls.entries[0]?.receiver).toBe(f.calls.policies[0]);
  expect(f.calls.entries[0]?.domain).toBe("alpha");
  expect(f.calls.legacy).toEqual([]);
  expect(f.sink.at("approved", "owned").timeline[0]).toMatchObject(raw);
  expect(f.sink.at("decoy", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("strictly decodes and discards unowned IDs without reading or selecting another active domain", async () => {
  let reads = 0;
  const f = await scopedCaptureFixture({ configureSink: sink => {
    const original = sink.read;
    vi.spyOn(sink, "read").mockImplementation(input => {
      reads++;
      return original.call(sink, input);
    });
  } });
  await f.begin();
  await f.entry("foreign", { type: "marker", label: "unowned" });
  await expect(f.entry("foreign", { type: "action", startedAt: 1 })).rejects.toThrow("recording.invalid_entry");
  expect(reads).toBe(0);
  expect(f.calls.selected).toEqual([]);
  expect(f.calls.legacy).toHaveLength(2);
  expect(f.sink.batches).toEqual([]);
  expect(f.gateway.snapshot().auditLog.some(event => event.type === "recording.event_discarded")).toBe(true);
  await f.gateway.close();
});

it("refuses a foreign target through the original stored domain policy rather than selecting from the target", async () => {
  const f = await scopedCaptureFixture();
  const original = await f.begin();
  const target = { domain: "beta" };
  await expect(f.entry("owned", { type: "action", actionType: "activate", parameters: {}, origin: "operator", startedAt: 2, target })).rejects.toThrow("recording.invalid_entry");
  expect(f.calls.selected[0]?.recording).toBe(original);
  expect(f.calls.entries[0]?.domain).toBe("alpha");
  expect(f.calls.legacy).toEqual([]);
  expect(f.sink.batches).toEqual([]);
  await f.gateway.close();
});

it("retains the original required-policy refusal without falling back to legacy ingress", async () => {
  const primary = new Error("recording.target_policy_required");
  const f = await scopedCaptureFixture({ configureScoped: scoped => {
    vi.spyOn(scoped, "forRecording").mockImplementation(() => { throw primary; });
  } });
  await f.begin();
  await expect(f.entry("owned", { type: "marker", label: "no fallback" })).rejects.toBe(primary);
  expect(f.calls.legacy).toEqual([]);
  expect(f.sink.batches).toEqual([]);
  await f.gateway.close();
});

it.each(["unavailable", "rejected"] as const)("retains the original %s read failure before any scoped callback or write", async failure => {
  const primary = new Error("actual recording read failed");
  const f = await scopedCaptureFixture({ configureSink: sink => {
    if (failure === "unavailable") vi.spyOn(sink, "read").mockResolvedValue({ kind: "unavailable", cause: primary });
    else vi.spyOn(sink, "read").mockRejectedValue(primary);
  } });
  await f.begin();
  await expect(f.entry("owned", { type: "marker", label: "no write" })).rejects.toBe(primary);
  expect(f.calls.selected).toEqual([]);
  expect(f.sink.batches).toEqual([]);
  await f.gateway.close();
});

it("refuses an actually missing stored recording at the captured project address", async () => {
  const f = await scopedCaptureFixture();
  await f.sink.create({ projectId: "decoy", recordingId: "owned", startedAt: 1, environment: { domainId: "beta" }, initialState: { timestamp: 1, namespaces: {} } });
  f.state.activeRecordings.set(f.owner, { projectId: "approved", recordingId: "owned", domainId: "alpha" });
  await expect(f.entry("owned", { type: "marker", label: "no foreign adoption" })).rejects.toThrow("test.recording_not_found");
  expect(f.calls.selected).toEqual([]);
  expect(f.sink.at("decoy", "owned").timeline).toEqual([]);
  expect(f.sink.batches).toEqual([]);
  await f.gateway.close();
});

it.each(["id", "project", "missing", "empty", "malformed", "active"] as const)("refuses corrupt or mismatched stored %s without choosing policy", async corruption => {
  const f = await scopedCaptureFixture();
  const recording = await f.begin();
  if (corruption === "id") recording.recordingId = "foreign";
  if (corruption === "project") recording.metadata.projectId = "foreign";
  if (corruption === "missing") Reflect.deleteProperty(recording.environment, "domainId");
  if (corruption === "empty") recording.environment.domainId = "";
  if (corruption === "malformed") Reflect.set(recording.environment, "domainId", 42);
  if (corruption === "active") f.state.activeRecordings.set(f.owner, { projectId: "approved", recordingId: "owned", domainId: "beta" });
  await expect(f.entry("owned", { type: "marker", label: "no write" })).rejects.toThrow(corruption === "id" || corruption === "project" ? "recording.owner_required" : "recording.domain_scope_refused");
  expect(f.calls.selected).toEqual([]);
  expect(f.sink.batches).toEqual([]);
  await f.gateway.close();
});

it("pins original sink and resolver pairs before awaits without requiring duplicated project metadata", async () => {
  const f = await scopedCaptureFixture();
  const original = await f.begin();
  const replacementRead = vi.fn(async () => { throw new Error("replacement read ran"); });
  const replacementPolicy = vi.fn(() => { throw new Error("replacement policy ran"); });
  f.sink.read = replacementRead;
  f.scoped.forRecording = replacementPolicy;
  await f.entry("owned", { type: "marker", label: "original owner" });
  await f.state.writeOrder.flush(f.owner);
  expect(replacementRead).not.toHaveBeenCalled();
  expect(replacementPolicy).not.toHaveBeenCalled();
  expect(f.calls.selected[0]?.recording).toBe(original);
  expect(f.calls.selected[0]?.receiver).toBe(f.scoped);
  expect(original.metadata.projectId).toBeUndefined();
  await f.gateway.close();
});

it("keeps the captured entry address while its original sink read is held", async () => {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reading = new Promise<void>(resolve => { entered = resolve; });
  const f = await scopedCaptureFixture({ configureSink: sink => {
    const original = sink.read;
    vi.spyOn(sink, "read").mockImplementation(async input => {
      const result = await original.call(sink, input);
      entered();
      await gate;
      return result;
    });
  } });
  const original = await f.begin();
  const pending = f.entry("owned", { type: "marker", label: "captured before read" });
  await reading;
  await f.begin("other", "owned", "beta");
  release();
  await pending;
  await f.state.writeOrder.flush(f.owner);
  expect(f.calls.selected[0]?.recording).toBe(original);
  expect(f.sink.at("approved", "owned").timeline).toMatchObject([{ label: "captured before read" }]);
  expect(f.sink.at("other", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("encodes the original command target and address after a held flush despite a new active project", async () => {
  const f = await scopedCaptureFixture();
  const original = await f.begin();
  await f.entry("owned", { type: "marker", label: "flush prefix" });
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const flushing = new Promise<void>(resolve => { entered = resolve; });
  const append = f.sink.appendBatch;
  vi.spyOn(f.sink, "appendBatch").mockImplementation(async input => {
    entered();
    await gate;
    return append.call(f.sink, input);
  });
  const target = { domain: "alpha", original: true };
  const command: ClientGatewayActionCommand = { actionType: "activate", target, parameters: { retained: [1, 2] } };
  const result: ClientGatewayActionResult = { commandId: "original", status: "unknown", startedAt: 5, completedAt: 8, message: "original result", payload: { evidence: [{ original: true }] }, metadata: { retained: true } };
  const pending = f.state.appendActionResult(f.session.sessionId, command, result);
  await flushing;
  await f.begin("other", "owned", "beta");
  command.target = { domain: "beta", replacement: true };
  release();
  await pending;
  expect(f.calls.commands).toHaveLength(1);
  expect(f.calls.commands[0]?.args).toEqual([target]);
  expect(f.calls.commands[0]?.args[0]).toBe(target);
  expect(f.calls.commands[0]?.receiver).toBe(f.calls.policies.at(-1));
  expect(f.calls.commands[0]?.domain).toBe("alpha");
  expect(f.calls.selected[0]?.recording).toBe(original);
  expect(f.calls.selected.at(-1)?.recording.environment.domainId).toBe("alpha");
  expect(f.calls.selected.at(-1)?.recording.timeline).toMatchObject([{ label: "flush prefix" }]);
  expect(f.sink.at("approved", "owned").timeline[1]).toMatchObject({ type: "action", parameters: command.parameters, target: { domain: "alpha", original: target }, startedAt: 5, completedAt: 8, correlationId: "original", result: { status: "unknown", message: "original result", metadata: { payload: result.payload, retained: true } } });
  expect(f.sink.at("other", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("retains a failed flush before reading or encoding command capture", async () => {
  const f = await scopedCaptureFixture();
  await f.begin();
  await f.entry("owned", { type: "marker", label: "prefix" });
  f.calls.selected.length = 0;
  const primary = new Error("actual prefix write failed");
  f.sink.appendError = primary;
  await expect(f.state.appendActionResult(f.session.sessionId, { actionType: "activate", target: {} }, { commandId: "one", status: "succeeded" })).rejects.toBe(primary);
  expect(f.calls.selected).toEqual([]);
  expect(f.calls.commands).toEqual([]);
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  await f.gateway.close();
});

it("retains the original command capture read error before calling the target encoder", async () => {
  const f = await scopedCaptureFixture();
  await f.begin();
  const primary = new Error("actual command recording unavailable");
  f.sink.readError = primary;
  await expect(f.state.appendActionResult(f.session.sessionId, { actionType: "activate", target: { domain: "alpha" } }, { commandId: "one", status: "unknown" })).rejects.toBe(primary);
  expect(f.calls.selected).toEqual([]);
  expect(f.calls.commands).toEqual([]);
  expect(f.sink.at("approved", "owned").timeline).toEqual([]);
  await f.gateway.close();
});
