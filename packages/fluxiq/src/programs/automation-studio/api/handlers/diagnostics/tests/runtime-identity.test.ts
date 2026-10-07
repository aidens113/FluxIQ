import { ClientGatewayService } from "../../../../../../client-gateway/index.ts";
import { bindTrustedModuleIdentity } from "../../../../../../runtime/build-identity/modules/index.ts";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { AutomationStudioApiDependencies } from "../../dependencies.ts";
import { registerRuntimeIdentityEndpoint } from "../index.ts";

function endpoint(identity: unknown) {
  let endpoint: any;
  registerRuntimeIdentityEndpoint({ registry: { register: (entry: unknown) => { endpoint = entry; } }, service: { coreRuntimeBuildIdentity: identity } } as unknown as AutomationStudioApiDependencies);
  return endpoint;
}
const file = "packages/fluxiq/dist/core/index.js";
const identity = { schema: 1, protocol: "fluxiq.core-runtime-identity.v1", version: "0.7.0", normalization: "reader-payload-v1", artifactDigest: "a".repeat(64), artifacts: { [file]: "b".repeat(64) } };
it("registers restricted read and projects hashes only from the actual retained service", async () => {
  const registered = endpoint(identity);
  expect(registered).toMatchObject({ classification: "read", permission: "programs.read" });
  const result = await registered.handler({ payload: { reachedInputs: [file] } });
  expect(result.payload.identity).not.toHaveProperty("artifacts");
  expect(result.payload.reachedInputsDigest).toBe(createHash("sha256").update(JSON.stringify([[`../!FluxIQ/${file}`, identity.artifacts[file]]])).digest("hex"));
});
it("refuses an unavailable build, absent artifact and traversal/ambiguous normalized reader", async () => {
  expect((await endpoint(null).handler({ payload: { reachedInputs: [file] } })).ok).toBe(false);
  expect((await endpoint(identity).handler({ payload: { reachedInputs: ["packages/contracts/dist/missing.js"] } })).ok).toBe(false);
  for (const reachedInputs of [[], ["packages/fluxiq/dist/../../private.js"], ["packages/fluxiq/dist/runtime/build-identity/read.js"]]) {
    await expect(endpoint(identity).handler({ payload: { reachedInputs } })).rejects.toThrow();
  }
});

it("projects active trusted module identity and never a cleared legacy anchor", async () => {
  let registered: any;
  const service = { coreRuntimeBuildIdentity: identity };
  const module = { schema: 1 as const, protocol: "fluxiq.module-build-identity.v1" as const, moduleId: "example/runtime", version: "1.0.0", normalization: "module-payload-v1" as const, artifactDigest: "c".repeat(64), sourceInputsDigest: "d".repeat(64) };
  registerRuntimeIdentityEndpoint({ registry: { register: (entry: unknown) => { registered = entry; } }, service } as unknown as AutomationStudioApiDependencies);
  bindTrustedModuleIdentity(service, module);
  expect((await registered.handler({ payload: { reachedInputs: [file] } })).payload.loadedModules).toEqual([module]);
  bindTrustedModuleIdentity(service);
  expect((await registered.handler({ payload: { reachedInputs: [file] } })).payload.loadedModules).toEqual([]);
});

it("projects listening transport from actual gateway separately from native host and clears on release", async () => {
  let registered: any; const service = { coreRuntimeBuildIdentity: identity }, clientGateway = new ClientGatewayService();
  const descriptor = { schema: 1 as const, protocol: "fluxiq.module-build-identity.v1" as const, moduleId: "fluxiq/web-client-gateway-server", version: "0.1.0", normalization: "module-payload-v1" as const, artifactDigest: "c".repeat(64), sourceInputsDigest: "d".repeat(64) };
  const host = { ...descriptor, moduleId: "example/host" }; bindTrustedModuleIdentity(service, host);
  registerRuntimeIdentityEndpoint({ registry: { register: (entry: unknown) => { registered = entry; } }, service, clientGateway } as unknown as AutomationStudioApiDependencies);
  const read = async () => (await registered.handler({ payload: { reachedInputs: [file] } })).payload;
  const lease = clientGateway.bindTransportBuildIdentity(descriptor);
  expect((await read()).serverTransportIdentity).toBeNull(); lease.activate();
  expect(await read()).toMatchObject({ loadedModules: [host], serverTransportIdentity: descriptor });
  lease.release(); expect((await read()).serverTransportIdentity).toBeNull(); expect((await read()).loadedModules).toEqual([host]);
});
