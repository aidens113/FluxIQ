import type { JsonObject } from "../../../../core/index.ts";
import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { IoRegistry } from "../../../../io/index.ts";
import type { RecordingIngressPolicy, RecordingScopedIngress } from "../../policies/index.ts";
import { ClientGatewayService } from "../../../index.ts";
import { RecordingBridgeState } from "../../internal/index.ts";
import { decodeRecordingEntry, isRecordingStateSnapshot, RecordingIngressShapes } from "../../decoding/index.ts";
import { MemoryRecordingSink } from "../../tests/sink.ts";
import { RecordingMessages } from "../../tests/messages.ts";

export async function scopedCaptureFixture(options: { legacy?: boolean; io?: IoRegistry; configureSink?: (sink: MemoryRecordingSink<JsonObject, JsonObject>) => void; configureScoped?: (ingress: RecordingScopedIngress<JsonObject, JsonObject>) => void } = {}) {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
  const sink = new MemoryRecordingSink<JsonObject, JsonObject>();
  options.configureSink?.(sink);
  const calls = {
    legacy: [] as Array<{ receiver: unknown; args: unknown[] }>,
    selected: [] as Array<{ receiver: unknown; args: unknown[]; recording: RecordingSession<JsonObject, JsonObject> }>,
    policies: [] as RecordingIngressPolicy<JsonObject, JsonObject>[],
    entries: [] as Array<{ receiver: unknown; args: unknown[]; domain: string | null | undefined }>,
    commands: [] as Array<{ receiver: unknown; args: unknown[]; domain: string | null | undefined }>
  };
  const initialState: RecordingIngressPolicy<JsonObject, JsonObject>["initialState"] = value => {
    if (!isRecordingStateSnapshot(value)) throw new Error("recording.invalid_initial_state");
    return value;
  };
  const ingress: RecordingIngressPolicy<JsonObject, JsonObject> = {
    entry(value) {
      calls.legacy.push({ receiver: this, args: Array.from(arguments) });
      return decodeRecordingEntry(value, { target: RecordingIngressShapes.jsonObject, evidence: RecordingIngressShapes.jsonObject });
    },
    commandTarget(value) {
      calls.legacy.push({ receiver: this, args: Array.from(arguments) });
      return value;
    },
    initialState
  };
  const scoped: RecordingScopedIngress<JsonObject, JsonObject> = {
    forRecording(recording) {
      calls.selected.push({ receiver: this, args: Array.from(arguments), recording });
      const domain = recording.environment.domainId;
      const selected: RecordingIngressPolicy<JsonObject, JsonObject> = {
        entry(value) {
          calls.entries.push({ receiver: this, args: Array.from(arguments), domain });
          return decodeRecordingEntry(value, { target: (target): target is JsonObject => RecordingIngressShapes.jsonObject(target) && (domain === null || target.domain === domain), evidence: RecordingIngressShapes.jsonObject });
        },
        commandTarget(value) {
          calls.commands.push({ receiver: this, args: Array.from(arguments), domain });
          return { domain: domain ?? null, original: value };
        },
        initialState
      };
      calls.policies.push(selected);
      return selected;
    }
  };
  options.configureScoped?.(scoped);
  const state = new RecordingBridgeState({
    gateway, sink, ingress,
    ...(!options.legacy ? { scopedIngress: scoped } : {}),
    ...(options.io ? { io: options.io } : {}),
    startPolicy: { diagnosticMetadata: { source: "scoped-capture" }, description: () => ({ ok: true, description: "Observe a process" }), context: () => ({ ok: true, projectId: "approved", domainId: "alpha" }) }
  });
  const connected = gateway.connect({ socket: { send: () => undefined } });
  await gateway.receive(connected.sessionId, RecordingMessages.hello({ clientId: "scoped-capture", clientType: "custom", name: "Scoped capture" }));
  const pairing = gateway.snapshot().pairings[0];
  if (!pairing) throw new Error("test.pairing_missing");
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "fixture.operator" });
  const session = state.session(connected.sessionId);
  const owner = state.recordingOwnerKey(session);
  const begin = async (projectId = "approved", recordingId = "owned", domainId: string | null = "alpha", metadata: JsonObject = {}) => {
    const recording = await sink.create({ projectId, recordingId, startedAt: 1, environment: { domainId }, metadata, initialState: { timestamp: 1, namespaces: {} } });
    const storedDomain = recording.environment.domainId;
    if (storedDomain === undefined) throw new Error("test.stored_domain_missing");
    state.activeRecordings.set(owner, { projectId, recordingId: recording.recordingId, domainId: storedDomain });
    return recording;
  };
  const entry = async (recordingId: string, value: JsonObject, projectId?: string) => {
    const message = RecordingMessages.entry({ recordingId, entry: value, ...(projectId ? { projectId } : {}) });
    if (message.type !== "client.recording_entry") throw new Error("test.entry_type");
    await state.storeClientMessage({ type: "client.recording_entry", session, message });
  };
  return { gateway, sink, state, session, owner, calls, ingress, scoped, begin, entry };
}
