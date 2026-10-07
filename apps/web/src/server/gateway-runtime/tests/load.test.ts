import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { gatewayServerRuntime } from "../index";
it("native preload refuses missing/wrong exports and preserves retained same-path executing factory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-runtime-loader-")), modulePath = path.join(root, "factory.mjs");
  try {
    expect(() => gatewayServerRuntime.read(modulePath)).toThrow(/preloaded/);
    await expect(gatewayServerRuntime.load(modulePath)).rejects.toThrow();
    const wrong = path.join(root, "wrong.mjs"); await writeFile(wrong, "export const wrong = true;"); await expect(gatewayServerRuntime.load(wrong)).rejects.toThrow(/must export/);
    const valid = path.join(root, "valid.mjs"); await writeFile(valid, "export function startClientGatewayWebSocketServer() { return { revision: 1 }; }");
    await gatewayServerRuntime.load(valid); const retained = gatewayServerRuntime.read(valid);
    await writeFile(valid, "export function startClientGatewayWebSocketServer() { return { revision: 2 }; }");
    await gatewayServerRuntime.load(valid); expect(gatewayServerRuntime.read(valid)).toBe(retained);
    expect((retained.startClientGatewayWebSocketServer as unknown as () => { revision: number })().revision).toBe(1);
  } finally { delete (globalThis as typeof globalThis & { __fluxiqGatewayServerModule?: unknown }).__fluxiqGatewayServerModule; await rm(root, { recursive: true, force: true }); }
});
