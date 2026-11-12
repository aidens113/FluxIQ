import { FLUXNODE_API_BASE_PATH } from "@fluxiq/contracts/fluxnode";
import { mkdir } from "node:fs/promises";
import type { FluxIQ } from "../../framework/index.ts";
import type { FluxNodeService } from "../../framework/automation-service/service/fluxnode/index.ts";
import { initializeFluxIQServerStorage, startHeadlessServer, type HeadlessServerHandle } from "../headless/index.ts";
import { loadFluxIQHostRegistration, resolveFluxIQHostModulePath } from "../host-module/index.ts";
import type { DevArguments } from "./dev-arguments.ts";
import { openHostInstance } from "./open-host-instance.ts";
import { loadManagedHostLauncher, startManagedHosts, type FluxIQHostLauncher } from "../managed-hosts/index.ts";
import { FluxNodeHostPool } from "../../framework/automation-service/service/fluxnode/hosts/index.ts";

/**
 * The seam for the FluxNode runner: given the opened instance (storage ready), builds the
 * service the FluxNode API calls. `runDev` does not construct the real service itself;
 * the caller (`run-command.ts`) passes the factory. Without one, no FluxNode API is served.
 */
export type RunDevOptions = {
  createFluxNodes?: (fluxiq: FluxIQ, hosts?: FluxNodeHostPool) => FluxNodeService | Promise<FluxNodeService>;
  /** Tests and embedded hosts may supply the launcher directly. */
  launcher?: FluxIQHostLauncher;
  signal?: AbortSignal;
  onHostFailure?: (error: unknown) => void;
};

/** A running `fluxiq dev`: its server and how to stop it. */
export type DevServer = { server: HeadlessServerHandle; stop(): Promise<void> };

/**
 * `fluxiq dev`: opens the instance at the data directory with the host module
 * `FLUXIQ_HOST_MODULE` names, readies its storage, and serves it headless on
 * 127.0.0.1. Prints the gateway and API addresses; `stop` closes the listeners
 * and the instance.
 */
export async function runDev(args: DevArguments, print: (line: string) => void = console.log, options: RunDevOptions = {}): Promise<DevServer> {
  options.signal?.throwIfAborted();
  await mkdir(args.dataDir, { recursive: true });
  const count = args.hosts ?? 0;
  const launcher = count > 0 ? options.launcher ?? await loadManagedHostLauncher(args.hostModule) : undefined;
  const hostPath = resolveFluxIQHostModulePath();
  const host = hostPath ? { path: hostPath, register: await loadFluxIQHostRegistration(hostPath) } : null;
  // The gateway tells a pairing client where to connect from this (`programs/_shared/runtime.ts`), as the web panel sets it.
  if (args.gatewayPort !== 0) process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ??= `ws://127.0.0.1:${args.gatewayPort}/client`;
  const fluxiq = await openHostInstance(args.dataDir, host);
  let server: HeadlessServerHandle | undefined;
  let managed: Awaited<ReturnType<typeof startManagedHosts>> | undefined;
  let pool: FluxNodeHostPool | undefined;
  let fluxNodes: FluxNodeService | undefined;
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => stopping ??= (async () => {
    const drained = await Promise.allSettled([fluxNodes?.close?.()]);
    const closed = await Promise.allSettled([pool?.close(), managed?.close()]);
    const listeners = await Promise.allSettled([server?.close()]);
    const instance = await Promise.allSettled([fluxiq.close()]);
    const failures = [...drained, ...closed, ...listeners, ...instance].filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), "Some engine resources could not close cleanly.");
  })();
  try {
    await initializeFluxIQServerStorage(fluxiq);
    if (count > 0 && !fluxiq.activeDomainId) throw new Error("Managed browsers require an active domain from FLUXIQ_HOST_MODULE.");
    pool = count > 0 ? new FluxNodeHostPool({ gateway: fluxiq.programs.clientGateway, domainId: fluxiq.activeDomainId!, capacity: count }) : undefined;
    fluxNodes = options.createFluxNodes ? await options.createFluxNodes(fluxiq, pool) : undefined;
    server = await startHeadlessServer({ fluxiq, apiPort: args.apiPort, gatewayPort: args.gatewayPort, ...(fluxNodes ? { fluxNodes } : {}) });
    if (launcher) managed = await startManagedHosts({ gateway: fluxiq.programs.clientGateway, launcher, count, domainId: fluxiq.activeDomainId!,
      gatewayUrl: server.gatewayUrl, coreApiUrl: server.apiUrl, dataDir: args.dataDir, headless: args.headless ?? false,
      profile: args.profileName === undefined ? { kind: "fresh" } : { kind: "named", name: args.profileName }, print,
      ...(options.signal ? { signal: options.signal } : {}),
      onFailure: (error) => {
        console.error("[FluxIQ] A managed browser could not be restored:", error);
        void stop().then(() => options.onHostFailure?.(error), (cleanup: unknown) => {
          const failure = new AggregateError([error, cleanup], "Managed host failure and engine shutdown failed.");
          console.error("[FluxIQ] Managed browser shutdown failed:", failure);
          options.onHostFailure?.(failure);
        });
      }
    });
  } catch (error) {
    try { await stop(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Engine startup failed and cleanup was incomplete."); }
    throw error;
  }
  print("FluxIQ is serving without the web panel.");
  print(`  Gateway: ${server.gatewayUrl}`);
  print(`  API:     ${server.apiUrl}/api/programs/<program>/<endpoint>`);
  if (options.createFluxNodes) {
    print(`  FluxNode: ${server.apiUrl}${FLUXNODE_API_BASE_PATH}`);
    print("FluxIQ accepts FluxNode calls from any program on this computer without a key. Run `fluxiq keys secure` to require one.");
  }
  print(`  Data:    ${args.dataDir}`);
  print(`  Host:    ${host ? host.path : "none (set FLUXIQ_HOST_MODULE to serve a domain)"}`);
  print("Press Ctrl+C to stop.");
  return {
    server,
    stop
  };
}
