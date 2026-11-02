import type { JsonObject } from "../../../core/index.ts";
import type { ClientGatewaySession, ClientGatewayStartRecordingRequest } from "../../../client-gateway/index.ts";
export type ClientRecordingContext = { ok: true; projectId: string; taskId?: string } | { ok: false; message: string; code?: string; metadata?: JsonObject };
export type ClientRecordingContextProvider = (input: { session: ClientGatewaySession; request: ClientGatewayStartRecordingRequest }) => ClientRecordingContext | Promise<ClientRecordingContext>;
