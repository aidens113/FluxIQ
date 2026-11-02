import type { ClientGatewayActionCommand } from "../../contracts.ts";
import type { ClientGatewayActionResult } from "../../contracts.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";

export async function appendActionResult<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, sessionId: string, command: ClientGatewayActionCommand, result: ClientGatewayActionResult): Promise<void> {
    const session = state.session(sessionId);
    const active = state.activeRecordings.get(state.recordingOwnerKey(session));
    if (!active) return;
    await state.writeOrder.flush(state.recordingOwnerKey(session));
    await state.sink.append({
      ...(active.projectId !== undefined ? { projectId: active.projectId } : {}),
      recordingId: active.recordingId,
      entry: {
        type: "action",
        actionType: command.actionType,
        parameters: command.parameters ?? {},
        ...(command.target ? { target: state.ingress.commandTarget(command.target) } : {}),
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
