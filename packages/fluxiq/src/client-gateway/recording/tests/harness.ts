import type { JsonObject } from "../../../core/index.ts";
import { ClientGatewayService } from "../../index.ts";
import { ClientGatewayRecordingBridge } from "../index.ts";
import type { RecordingStartPolicy } from "../policies/index.ts";
import { decodeRecordingEntry, RecordingIngressShapes, isRecordingStateSnapshot } from "../decoding/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import { MemoryRecordingSink } from "./sink.ts";
import { RecordingMessages as M } from "./messages.ts";

export async function recordingHarness(options: { policy?: RecordingStartPolicy; io?: IoRegistry; stopDrainMs?: number; gateway?: ClientGatewayService } = {}) {
  const gateway = options.gateway ?? new ClientGatewayService({ commandTimeoutMs: 1000 });
  const sink = new MemoryRecordingSink<JsonObject, JsonObject>();
  const policy: RecordingStartPolicy = options.policy ?? {
    diagnosticMetadata: { source: "capture-test" },
    description: value => typeof value === "string" && value.trim() ? { ok: true, description: value.trim() } : { ok: false, code: "recording.description_required", message: "A description is required." },
    context: () => ({ ok: true, projectId: "approved" })
  };
  const bridge = new ClientGatewayRecordingBridge({
    gateway, sink, startPolicy: policy, stopDrainMs: options.stopDrainMs ?? 0,
    ...(options.io !== undefined ? { io: options.io } : {}),
    ingress: {
      entry: value => decodeRecordingEntry(value, { target: RecordingIngressShapes.jsonObject, evidence: RecordingIngressShapes.jsonObject }),
      commandTarget: value => value,
      initialState: value => {
        if (!isRecordingStateSnapshot(value)) throw new Error("recording.invalid_initial_state");
        return value;
      }
    }
  });
  const session = gateway.connect({ socket: { send: () => undefined } });
  await gateway.receive(session.sessionId, M.hello({ clientId: "capture-client", clientType: "custom", name: "Capture client" }));
  const pairing = gateway.snapshot().pairings[0];
  if (!pairing) throw new Error("test.pairing_missing");
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "test.operator" });
  return { gateway, sink, bridge, session, policy };
}
