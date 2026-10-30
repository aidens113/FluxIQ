import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { gatewayServerRuntime } from "../index";

type RuntimeGlobal = typeof globalThis & { __fluxiqGatewayServerModule?: { path: string } };
const previous = process.env.FLUXIQ_GATEWAY_SERVER_MODULE;
const roots: string[] = [];

afterEach(async () => {
  if (previous === undefined) delete process.env.FLUXIQ_GATEWAY_SERVER_MODULE;
  else process.env.FLUXIQ_GATEWAY_SERVER_MODULE = previous;
  delete (globalThis as RuntimeGlobal).__fluxiqGatewayServerModule;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("FLUXIQ_GATEWAY_SERVER_MODULE overrides the default bundle path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-runtime-env-"));
  roots.push(root);
  const bundle = path.join(root, "custom.mjs");
  await writeFile(bundle, "export function startClientGatewayWebSocketServer() { return { custom: true }; }");
  process.env.FLUXIQ_GATEWAY_SERVER_MODULE = bundle;
  await gatewayServerRuntime.load();
  const start = gatewayServerRuntime.read().startClientGatewayWebSocketServer as unknown as () => { custom: boolean };
  expect(start().custom).toBe(true);
  expect((globalThis as RuntimeGlobal).__fluxiqGatewayServerModule?.path).toBe(path.resolve(bundle));
});
