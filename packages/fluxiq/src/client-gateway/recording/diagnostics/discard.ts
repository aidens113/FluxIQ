import { reserveClosedRecordingOwner } from "../values/index.ts";
import type { ClientGatewaySession } from "../../contracts.ts";
import type { DiscardedClientMessage } from "../internal/index.ts";
import type { RecordingBridgeState } from "../internal/index.ts";
import { compactJsonObject } from "../values/index.ts";
import { discardedClientMessageSummary } from "./summary.ts";

export function noteDiscardedClientMessage<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, session: ClientGatewaySession, discarded: DiscardedClientMessage): void {
    const ownerKey = state.recordingOwnerKey(session);
    const closed = state.closedRecordings.get(ownerKey) ?? { discardedEvents: 0, discardedActions: 0, reported: false };
    reserveClosedRecordingOwner(state.closedRecordings, ownerKey);
    state.closedRecordings.set(ownerKey, closed);
    const executable = discarded.executable ?? state.isExecutableActionInput(discarded.domainId ?? closed.domainId, discarded.inputId);
    closed.discardedEvents += 1;
    if (executable) closed.discardedActions += 1;
    if (closed.reported && !executable) return;
    closed.reported = true;
    const recordingId = discarded.recordingId ?? closed.recordingId;
    const remembered = recordingId === closed.recordingId;
    const sinceFinalizedMs = !remembered || closed.finalizedAt === undefined ? undefined : Math.max(0, Date.now() - closed.finalizedAt);
    state.gateway.recordAuditEvent({
      type: executable ? "recording.action_discarded" : "recording.event_discarded",
      message: discardedClientMessageSummary(discarded, recordingId, executable, sinceFinalizedMs),
      sessionId: session.sessionId,
      metadata: compactJsonObject({
        ...state.startPolicy.diagnosticMetadata,
        clientId: session.clientId,
        clientName: session.name,
        recordingId,
        projectId: remembered ? closed.projectId : undefined,
        eventType: discarded.label,
        inputId: discarded.inputId,
        domainId: discarded.domainId ?? closed.domainId ?? undefined,
        executable,
        discardedEvents: closed.discardedEvents,
        discardedActions: closed.discardedActions,
        sinceFinalizedMs
      })
    });
  }
