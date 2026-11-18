import { vi } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../index.ts";
import { openTrace } from "../../../tests/trace-tap-support.ts";
import { AutomationStudioHostLeaseAuthority } from "../../../../runtime/project-agents/host-resources/index.ts";
import { automationStudioProjectHostLeaseScope } from "../../../../runtime/project-agents/dispatch/index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandOutcome as Outcome, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../index.ts";
import { ClientGatewayCommandUnsentRefusal as Unsent } from "../unsent-refusal.ts";

/** Actual trusted gateway and authority, with controllable storage/trace/timer pretransport boundaries. */
export async function leaseAdmissionFixture(options: { pause?: "resolve" | "claim"; traceHook?: () => void; timerHook?: (fire: () => void) => void; synchronousReply?: boolean } = {}) {
  let enter!: () => void, proceed!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const gate = new Promise<void>((resolve) => { proceed = resolve; });
  let record: ClientGatewayCommandRecord | null = null;
  const ledger: ClientGatewayCommandLedgerPort = {
    claim: vi.fn(async (claim) => {
      const sendAllowed = record === null;
      record ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
      if (options.pause === "claim") { enter();
        await gate; }
      return { sendAllowed, record };
    }),
    commitReceipt: vi.fn(async (_claim, receipt) => { record = { ...record!, state: "committed", receipt, committedAt: Date.now() };
      return record; }),
    markUnknown: vi.fn(async (_claim, reason) => { record = { ...record!, state: "unknown", unknownReason: reason };
      return record; }),
    read: vi.fn(async () => record),
    refuseUnsent: vi.fn(async (claim, proof) => {
      if (record?.state !== "pending") throw new Error("not pending");
      record = { ...record, state: "refused_unsent", refusal: { ...Unsent.read(proof, claim) } };
      return record;
    })
  };
  const authority = AutomationStudioHostLeaseAuthority.for({});
  const binding = authority.forDomain("synthetic.domain");
  const context = Context.issue({ projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "attempt.1", effectOrdinal: 0 });
  const observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined), unsent: vi.fn(async () => undefined) };
  Outcome.require(context, observer);
  const trace = openTrace("trace.admission");
  const originalRecord = trace.recorder.record.bind(trace.recorder);
  vi.spyOn(trace.recorder, "record").mockImplementation((event) => {
    if (event.kind === "outbound" && event.messageType === "server.execute_action") options.traceHook?.();
    return originalRecord(event);
  });
  let tracing = false;
  const resolve = vi.fn(async () => {
    if (options.pause === "resolve") { enter();
      await gate; }
    return { ledger, outcomeObserver: observer, close: async () => undefined };
  });
  let sessionId = "";
  const actions: Array<Record<string, unknown>> = [];
  const abort = new AbortController();
  const gateway = new ClientGatewayService({ hostLease: authority.gatewaySource, resolveCommandLedger: resolve,
    trace: { current: () => tracing ? trace.recorder : undefined },
    startTimer: (_wait, _delay, fire) => { options.timerHook?.(fire);
      return { cancel: () => undefined }; }
  });
  const session = gateway.connect({ socket: { send(raw) {
    const envelope = JSON.parse(raw);
    if (envelope.type !== "server.execute_action") return;
    actions.push(envelope.payload);
    const answer = () => { void gateway.receive(sessionId, { id: "answer", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: envelope.payload.commandId, status: "succeeded" } }); };
    if (options.synchronousReply) answer(); else queueMicrotask(answer);
  } } });
  sessionId = session.sessionId;
  const metadata = { domainId: "synthetic.domain" };
  await gateway.receive(sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [], metadata } });
  await gateway.approvePairing(gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId)!.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(sessionId);
  tracing = true;
  let epoch = 0;
  const scope = automationStudioProjectHostLeaseScope({ capacity: 1, acquire: () => ({ resourceKey: "synthetic.host", epoch: ++epoch }), release: () => undefined }, binding);
  return {
    gateway, sessionId, actions, scope, binding, context, observer, ledger, resolve, entered, proceed, abort, metadata,
    dispatch: () => gateway.executeAction(sessionId, { actionType: "synthetic.act" }, { context, signal: abort.signal }),
    saved: () => record,
    async close() { proceed();
      await gateway.close();
      await trace.recorder.flush(); }
  };
}
