import { mkdir } from "node:fs/promises";
import { initializeFluxIQServerStorage, startHeadlessServer, type HeadlessServerHandle } from "../headless/index.ts";
import { loadFluxIQHostRegistration, resolveFluxIQHostModulePath } from "../host-module/index.ts";
import type { DevArguments } from "./dev-arguments.ts";
import { openHostInstance } from "./open-host-instance.ts";

/** A running `fluxiq dev`: its server and how to stop it. */
export type DevServer = { server: HeadlessServerHandle; stop(): Promise<void> };

/**
 * `fluxiq dev`: opens the instance at the data directory with the host module
 * `FLUXIQ_HOST_MODULE` names, readies its storage, and serves it headless on
 * 127.0.0.1. Prints the gateway and API addresses; `stop` closes the listeners
 * and the instance.
 */
export async function runDev(args: DevArguments, print: (line: string) => void = console.log): Promise<DevServer> {
  await mkdir(args.dataDir, { recursive: true });
  const hostPath = resolveFluxIQHostModulePath();
  const host = hostPath ? { path: hostPath, register: await loadFluxIQHostRegistration(hostPath) } : null;
  // The gateway tells a pairing client where to connect from this (`programs/_shared/runtime.ts`), as the web panel sets it.
  if (args.gatewayPort !== 0) process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ??= `ws://127.0.0.1:${args.gatewayPort}/client`;
  const fluxiq = await openHostInstance(args.dataDir, host);
  let server: HeadlessServerHandle;
  try {
    await initializeFluxIQServerStorage(fluxiq);
    server = await startHeadlessServer({ fluxiq, apiPort: args.apiPort, gatewayPort: args.gatewayPort });
  } catch (error) {
    await fluxiq.close();
    throw error;
  }
  print("FluxIQ is serving without the web panel.");
  print(`  Gateway: ${server.gatewayUrl}`);
  print(`  API:     ${server.apiUrl}/api/programs/<program>/<endpoint>`);
  print(`  Data:    ${args.dataDir}`);
  print(`  Host:    ${host ? host.path : "none (set FLUXIQ_HOST_MODULE to serve a domain)"}`);
  print("Press Ctrl+C to stop.");
  return {
    server,
    // The listeners stop taking connections at once; an open gateway socket ends with the process.
    stop: async () => {
      const listeners = server.close();
      listeners.catch((error: unknown) => console.warn(`[FluxIQ] A listener did not close cleanly (${error instanceof Error ? error.name : "non_error"}).`));
      await fluxiq.close();
    }
  };
}
