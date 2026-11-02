import type { JsonObject } from "../../../core/index.ts";
import type { ClientMessageSender } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { createEnvelope } from "../../../io/index.ts";
import { RecordingIoRecorder } from "../../../runtime/recording/io/index.ts";
import { compactJsonObject } from "../values/index.ts";

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
    if (!state.io?.hasInput(input.domainId, input.inputId)) return false;
    const recorder = new RecordingIoRecorder({
      sink: state.sink,
      io: state.io,
      domainId: input.domainId,
      ...(input.active.projectId !== undefined ? { projectId: input.active.projectId } : {})
    });
    await state.appendOrDiscard(input.active, [input.sender], () => recorder.recordInput(input.active.recordingId, input.inputId, createEnvelope({
      domainId: input.domainId,
      ioId: input.inputId,
      payload: input.payload,
      ...(input.timestampMs !== undefined ? { timestampMs: input.timestampMs } : {}),
      metadata: compactJsonObject({ sourceId: input.sourceId, clientGatewayMessageId: input.messageId, ...(input.metadata ?? {}) })
    })));
    return true;
  }
