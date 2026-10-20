import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayOutboxLoss } from "./loss/index.ts";

/**
 * What a queued message belongs to, fixed when it is queued.
 *
 * - `session`: the client's trust lineage, not the wire `sessionId`. Core mints
 *   a new `sessionId` for every socket, while a reconnect that resumes by token
 *   keeps the same trusted client, which is what Core files recordings under.
 *   One lineage id is kept while each new socket resumes by token and replaced
 *   whenever a socket had to pair (see `clientGatewayLineageAfterReady`).
 * - `projectId`: the client's current project when queued, `null` when none.
 * - `recordingId`: the recording the payload names, else the recording in
 *   progress when queued, else `null` (see `clientGatewayOutboxBinding`).
 */
export type ClientGatewayOutboxBinding = {
  session: string;
  projectId: string | null;
  recordingId: string | null;
};

/**
 * One queued client message with the binding it was queued under. `bytes` is
 * its size as the outbox measured it when queued; an entry stored without it
 * is measured when the outbox next judges its byte budget.
 */
export type ClientGatewayOutboxEntry = {
  binding: ClientGatewayOutboxBinding;
  message: ClientGatewayClientMessage;
  bytes?: number;
};

/**
 * Everything an outbox keeps: the current lineage, if one was set, the entries
 * in queue order, and the loss not yet reported to the gateway, if any.
 */
export type ClientGatewayOutboxState = {
  lineage?: string;
  entries: ClientGatewayOutboxEntry[];
  lost?: ClientGatewayOutboxLoss;
};

/**
 * Where an outbox keeps its state. The host chooses the lifetime: a browser
 * keeps it for the browser session, never longer, so queued page data does not
 * outlive the session that recorded it.
 */
export type ClientGatewayOutboxStore = {
  read(): Promise<ClientGatewayOutboxState>;
  write(state: ClientGatewayOutboxState): Promise<void>;
};

/** What the client is working in when it queues a message. */
export type ClientGatewayOutboxContext = {
  projectId: string | null;
  recordingId: string | null;
};
