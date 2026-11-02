import type { ClientGatewaySession } from "../../contracts.ts";
import type { DiscardedClientMessage } from "./discarded.ts";
export type ClientMessageSender = { session: ClientGatewaySession; message: DiscardedClientMessage };
