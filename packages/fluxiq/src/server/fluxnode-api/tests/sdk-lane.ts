// Test support for the SDK acceptance test: the real FluxNode API handler on a loopback listener over the
// real runner (`fluxNodeLane`: a scripted model on the lending library), and the real `@fluxiq/sdk` client
// connected to it. Nothing here is a fake of the SDK, the API or the runner.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "@fluxiq/sdk";
import { fluxNodeLane } from "../../../framework/automation-service/service/fluxnode/tests/library-lane.ts";
import { fluxNodeApiHandler } from "../api-handler.ts";

/** The lane, served over loopback HTTP, with an SDK client that found the engine at its address in open mode. */
export async function sdkLane(cleanups: (() => Promise<void>)[]) {
  const lane = await fluxNodeLane(cleanups);
  const server = createServer(fluxNodeApiHandler(lane.fluxNodes));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  // An empty credentials folder, so the connection is open mode whatever the machine's own `~/.fluxiq` holds.
  const home = await mkdtemp(path.join(os.tmpdir(), "fluxiq-sdk-home-"));
  // Closed before the service the lane opened: nothing should reach a service that is going away.
  cleanups.unshift(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(home, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const fluxiq = await FluxIQ.connect({ url, env: { FLUXIQ_CONFIG_DIR: home }, cwd: home });
  return { ...lane, fluxiq, url };
}
