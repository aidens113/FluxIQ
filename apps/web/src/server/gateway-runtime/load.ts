import path from "node:path";
import { pathToFileURL } from "node:url";
import type { GatewayServerRuntime } from "./types";
type RuntimeGlobal = typeof globalThis & { __fluxiqGatewayServerModule?: { path: string; runtime: GatewayServerRuntime } };
const intendedPath = (modulePath?: string) => path.resolve(modulePath ?? path.join(process.cwd(), ".server-runtime/client-gateway-server.mjs"));
/** Native import keeps the executing adapter separate from Next route bundles. */
export const gatewayServerRuntime = Object.freeze({
  async load(modulePath?: string): Promise<void> {
    const target = intendedPath(modulePath), state = globalThis as RuntimeGlobal;
    if (state.__fluxiqGatewayServerModule?.path === target) return;
    const namespace = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(target).href) as Partial<GatewayServerRuntime>;
    if (typeof namespace.startClientGatewayWebSocketServer !== "function") throw new Error("Native gateway server module must export startClientGatewayWebSocketServer.");
    state.__fluxiqGatewayServerModule = { path: target, runtime: Object.freeze({ startClientGatewayWebSocketServer: namespace.startClientGatewayWebSocketServer }) };
  },
  read(modulePath?: string): GatewayServerRuntime {
    const target = intendedPath(modulePath), loaded = (globalThis as RuntimeGlobal).__fluxiqGatewayServerModule;
    if (!loaded || loaded.path !== target) throw new Error("Native gateway server module has not been preloaded; initialize the web runtime before enabled gateway startup.");
    return loaded.runtime;
  }
});
