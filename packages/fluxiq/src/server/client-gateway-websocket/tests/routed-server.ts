import { once } from "node:events";
import { connect, type AddressInfo } from "node:net";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import { openRawWebSocket, type RawWebSocketClient } from "../../tests/raw-websocket-client.ts";
import { startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerOptions } from "../start-server.ts";
import type { ClientGatewayResolver } from "../routing/index.ts";

export const ROUTED_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

export async function withRoutedServer(
  resolver: ClientGatewayResolver,
  run: (input: {
    primary: ClientGatewayService;
    handle: ReturnType<typeof startClientGatewayWebSocketServer>;
    open(): Promise<RawWebSocketClient>;
  }) => Promise<void>,
  options: Omit<ClientGatewayWebSocketServerOptions, "gateway" | "port" | "resolveGateway"> = {}
): Promise<void> {
  const primary = new ClientGatewayService();
  const handle = startClientGatewayWebSocketServer({
    gateway: primary,
    port: 0,
    profile: "service",
    allowedOrigins: [ROUTED_ORIGIN],
    limits: { maxFrameBytes: 4096, helloDeadlineMs: 2000 },
    ...options,
    resolveGateway: resolver
  });
  await once(handle.server, "listening");
  const port = (handle.server.address() as AddressInfo).port;
  const clients: RawWebSocketClient[] = [];
  try {
    await run({
      primary,
      handle,
      open: async () => {
        const socket = connect({ host: "127.0.0.1", port });
        await once(socket, "connect");
        const client = await openRawWebSocket({ socket, hostHeader: `127.0.0.1:${port}`, path: "/client", origin: ROUTED_ORIGIN });
        clients.push(client);
        return client;
      }
    });
  } finally {
    await handle.close();
    for (const client of clients) client.destroy();
  }
}

export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}
