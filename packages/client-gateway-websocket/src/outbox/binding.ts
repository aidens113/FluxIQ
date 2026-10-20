import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayOutboxBinding, ClientGatewayOutboxContext } from "./types.ts";

/**
 * The binding a message is queued under: the given lineage, the current
 * project, and the recording the payload names (a string `recordingId`), else
 * the recording in progress, else none.
 */
export function clientGatewayOutboxBinding(
  message: ClientGatewayClientMessage,
  session: string,
  context: ClientGatewayOutboxContext
): ClientGatewayOutboxBinding {
  const named = (message.payload as { recordingId?: unknown } | undefined)?.recordingId;
  return {
    session,
    projectId: context.projectId,
    recordingId: typeof named === "string" ? named : context.recordingId
  };
}
