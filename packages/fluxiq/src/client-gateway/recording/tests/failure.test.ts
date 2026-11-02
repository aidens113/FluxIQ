import { afterEach, expect, it, vi } from "vitest";
import { ClientGatewayService } from "../../index.ts";
import { CaptureCommandLedger } from "./ledger.ts";
import { ClientGatewayCommandContext, ClientGatewayCommandOutcome } from "../../service/command-ledger/index.ts";
import { recordingHarness } from "./harness.ts";
import { RecordingMessages as M } from "./messages.ts";

afterEach(() => vi.useRealTimers());

it.each(["unavailable", "rejected"] as const)("propagates the original append failure when a recording read is %s", async readFailure => {
  const h = await recordingHarness();
  await h.bridge.startRecording({ sessionId: h.session.sessionId, recordingId: "read-failure", description: "Observe a process" });
  const appendCause = new Error("private append data");
  h.sink.appendError = appendCause;
  h.sink.readError = new Error("private read data");
  if (readFailure === "rejected") vi.spyOn(h.sink, "read").mockRejectedValue(h.sink.readError);
  await expect(h.gateway.receive(h.session.sessionId, M.error({ message: "capture" }))).rejects.toBe(appendCause);
  expect(h.gateway.snapshot().auditLog.filter(event => event.type.endsWith("_discarded"))).toEqual([]);
});

it("discards a failed append only after a successful read confirms actual finalization", async () => {
  const h = await recordingHarness();
  await h.bridge.startRecording({ sessionId: h.session.sessionId, recordingId: "closed", description: "Observe a process" });
  await h.sink.finalize({ projectId: "approved", recordingId: "closed" });
  await h.gateway.receive(h.session.sessionId, M.error({ message: "late marker" }));
  expect(h.gateway.snapshot().auditLog.filter(event => event.type === "recording.event_discarded")).toHaveLength(1);
  expect(h.sink.at("approved", "closed").timeline).toEqual([]);
});

it("reports timer batch failure without raw data, surfaces it at Stop and never retries removed entries", async () => {
  vi.useFakeTimers();
  const h = await recordingHarness();
  await h.gateway.receive(h.session.sessionId, M.start({ recordingId: "batch", description: "Observe a process" }));
  const cause = new Error("secret payload and storage path");
  h.sink.appendError = cause;
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "batch", entry: { type: "marker", label: "private entry content" } }));
  await vi.advanceTimersByTimeAsync(25);
  expect(h.sink.batches).toHaveLength(1);
  const failures = h.gateway.snapshot().auditLog.filter(event => event.type === "recording.write_failed");
  expect(failures).toHaveLength(1);
  expect(JSON.stringify(failures)).not.toContain("secret");
  expect(JSON.stringify(failures)).not.toContain("private entry content");
  h.sink.appendError = undefined;
  await h.gateway.receive(h.session.sessionId, M.entry({ recordingId: "batch", entry: { type: "marker", label: "later entry" } }));
  await expect(h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "batch" }))).rejects.toBe(cause);
  expect(h.sink.at("approved", "batch").timeline).toMatchObject([{ label: "later entry" }]);
  expect(h.sink.batches).toHaveLength(2);
  expect(h.sink.finalizations).toEqual([]);
  await h.gateway.receive(h.session.sessionId, M.stop({ recordingId: "batch" }));
  expect(h.sink.batches).toHaveLength(2);
  expect(h.sink.at("approved", "batch").endedAt).toBeDefined();
});

it("stops the exact durable Context when capture fails and propagates the original failure", async () => {
  const ledger = new CaptureCommandLedger();
  const uncertain = vi.fn(async () => undefined);
  const observer = { completed: async () => undefined, uncertain };
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1000, resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
  const h = await recordingHarness({ gateway });
  await h.bridge.startRecording({ sessionId: h.session.sessionId, recordingId: "durable", description: "Observe a process" });
  const context = ClientGatewayCommandContext.issue({ projectId: "approved", runId: "run", flowId: "flow", invocationId: "invocation", attemptId: "attempt", effectOrdinal: 0 });
  ClientGatewayCommandOutcome.require(context, observer);
  const cause = new Error("capture failed privately");
  h.sink.appendError = cause;
  const stop = vi.spyOn(ClientGatewayCommandOutcome, "stop");
  const completion = h.bridge.executeAction(h.session.sessionId, { actionType: "process.finish" }, { context }).then(value => ({ kind: "returned", value }), cause => ({ kind: "threw", cause }));
  await vi.waitFor(() => expect(gateway.outbound(h.session.sessionId).some(message => message.type === "server.execute_action")).toBe(true));
  const command = gateway.outbound(h.session.sessionId).find(message => message.type === "server.execute_action");
  if (!command) throw new Error("test.command_missing");
  await gateway.receive(h.session.sessionId, M.result({ commandId: command.payload.commandId, status: "succeeded" }));
  expect(await completion).toEqual({ kind: "threw", cause });
  expect(stop).toHaveBeenCalledWith(context, "bridge.capture_failed");
  expect(uncertain).toHaveBeenCalledWith(context, "bridge.capture_failed");
  expect(ledger.record?.state).toBe("committed");
  await gateway.close();
});
