import type { ClientGatewayActionResult } from "../action/index.ts";
import type { ClientGatewayServerMessage } from "./server-message.ts";

export type ClientGatewayActionResponse = {
  commandId: string;
  message: ClientGatewayServerMessage;
  result: Promise<ClientGatewayActionResult>;
};
