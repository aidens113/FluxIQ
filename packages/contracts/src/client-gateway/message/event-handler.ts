import type { ClientGatewayEvent } from "./event.ts";

export type ClientGatewayEventHandler = (event: ClientGatewayEvent) => void | Promise<void>;
