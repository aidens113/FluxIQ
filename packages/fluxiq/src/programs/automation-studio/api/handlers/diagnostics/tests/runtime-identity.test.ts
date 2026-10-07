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
