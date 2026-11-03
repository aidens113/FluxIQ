import type { ClientGatewayActionCommand } from "../../contracts.ts";
import type { ClientGatewayActionResult } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";
import { captureRecordingIngress } from "./scoped/index.ts";

export async function appendActionResult<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, sessionId: string, command: ClientGatewayActionCommand, result: ClientGatewayActionResult): Promise<void> {
    const session = state.session(sessionId);
    const open = state.activeRecordings.get(state.recordingOwnerKey(session));
    const active = state.scopedIngress && open ? { ...open } : open;
    if (!active) return;
    const capturedTarget = state.scopedIngress ? command.target : undefined;
    await state.writeOrder.flush(state.recordingOwnerKey(session));
    const ingress = state.scopedIngress ? await captureRecordingIngress(state, active) : state.ingress;
    await state.sink.append({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "action",
        actionType: command.actionType,
        parameters: command.parameters ?? {},
        ...((state.scopedIngress ? capturedTarget : command.target) ? { target: ingress.commandTarget((state.scopedIngress ? capturedTarget : command.target)!) } : {}),
        origin: "runtime",
        startedAt: result.startedAt ?? Date.now(),
        ...(result.completedAt !== undefined ? { completedAt: result.completedAt } : {}),
        sourceId: `client.${session.clientId}.events`,
        correlationId: result.commandId,
        result: {
          status: result.status,
          ...(result.message ?? result.error ? { message: result.message ?? result.error } : {}),
          metadata: compactJsonObject({ ...(result.payload !== undefined ? { payload: result.payload } : {}), ...(result.metadata ?? {}) })
        }
      }
    });
  }
