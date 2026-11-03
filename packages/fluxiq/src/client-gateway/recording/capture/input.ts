import type { JsonObject } from "../../../core/index.ts";
import type { ClientMessageSender } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { createEnvelope } from "../../../io/index.ts";
import { RecordingIoRecorder } from "../../../runtime/recording/io/index.ts";
import { compactJsonObject } from "../values/index.ts";
import { matchesCaptureDomain, readCaptureRecording } from "./scoped/index.ts";

export async function recordGatewayInput<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, input: {
    active: { projectId?: string | null; recordingId: string; domainId?: string | null };
    domainId: string;
    inputId: string;
    payload: JsonObject;
    timestampMs?: number;
    sourceId: string;
    messageId: string;
    metadata?: JsonObject;
    sender: ClientMessageSender;
  }): Promise<boolean> {
    const active = state.scopedIngress ? { ...input.active } : input.active;
    const domainId = input.domainId;
    if (state.scopedIngress) {
      await readCaptureRecording(state, active);
      if (!matchesCaptureDomain(active, domainId, input.metadata?.domainId)) {
        state.noteDiscardedClientMessage(input.sender.session, input.sender.message);
        return true;
      }
    }
    if (!state.io?.hasInput(domainId, input.inputId)) return false;
    if (state.scopedIngress && input.sender.message.executable === false && state.io.getInput(domainId, input.inputId)?.definition.role === "action") return false;
    const recorder = new RecordingIoRecorder({
      sink: state.sink,
      io: state.io,
      domainId,
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {})
    });
    await state.appendOrDiscard(active, [input.sender], () => recorder.recordInput(active.recordingId, input.inputId, createEnvelope({
      domainId,
      ioId: input.inputId,
      payload: input.payload,
      ...(input.timestampMs !== undefined ? { timestampMs: input.timestampMs } : {}),
      metadata: compactJsonObject({ sourceId: input.sourceId, clientGatewayMessageId: input.messageId, ...(input.metadata ?? {}) })
    })));
    return true;
  }
