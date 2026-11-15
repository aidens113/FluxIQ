import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createSession } from "@fluxiq/sdk";
import { keySessionFixture } from "../../../platform/keys/tests/key-session-fixture.ts";
import { keysApiHandler } from "../index.ts";

/** Loopback-only injected test listener; discovery is a fixture, while signing, exchange and SQLite are production code. */
export async function keyHttpLane(cleanups: Array<() => Promise<void>>) {
  const fixture = await keySessionFixture(cleanups);
  let exchanges = 0;
  let handler: ReturnType<typeof keysApiHandler> | undefined;
  const server = createServer((request, response) => {
    if (request.url === "/.well-known/fluxiq") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ instance: { id: "instance-1" } }));
      return;
    }
    if (request.url === "/api/keys/session") exchanges += 1;
    if (!handler) throw new Error("The test handler is not ready.");
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const service = fixture.serviceFor({ origin });
  handler = keysApiHandler(service);
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return {
    ...fixture,
    origin,
    service,
    exchangeCount: () => exchanges,
    replaceHandler: (next: ReturnType<typeof keysApiHandler>) => { handler = next; },
    sdkSession: (clockOffsetMs = 0) => createSession({
      baseUrl: origin,
      credential: { key: fixture.key, explicit: true },
      fetch,
      now: () => fixture.state.nowMs + clockOffsetMs
    })
  };
}
