import type { ClientGatewayWebSocketServerOptions, ClientGatewayWebSocketServerHandle } from "../client-gateway-websocket";
export type GatewayServerRuntime = Readonly<{ startClientGatewayWebSocketServer(options: ClientGatewayWebSocketServerOptions): ClientGatewayWebSocketServerHandle }>;
