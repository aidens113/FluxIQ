import { createHash } from "node:crypto";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

/** Authenticated, read-only projection of the retained executing service's build. */
export function registerRuntimeIdentityEndpoint({ registry, service }: AutomationStudioApiDependencies): void {
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runtimeBuildIdentity, permission: "programs.read", classification: "read",
    handler: async request => {
      const inputs = (request.payload as { reachedInputs?: unknown } | undefined)?.reachedInputs;
      if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 5_000 || inputs.some(input => typeof input !== "string" || !/^packages\/(fluxiq|contracts)\/dist\/[a-zA-Z0-9_./-]+\.js$/.test(input) || input.includes(".."))) throw new Error("Runtime identity needs bounded reached artifact paths.");
      const identity = service.coreRuntimeBuildIdentity;
      if (!identity) return { ok: false, error: "Executing Core runtime build identity is unavailable." };
      const keys = [...new Set(inputs as string[])].sort();
      // The self-containing payload is bound by normalized artifactDigest, never a circular raw hash.
      if (keys.includes("packages/fluxiq/dist/runtime/build-identity/read.js")) throw new Error("The normalized identity reader is not a raw reached contract input.");
      if (keys.some(key => !identity.artifacts[key])) return { ok: false, error: "Executing Core runtime lacks a reached artifact." };
      return { ok: true, payload: { identity: { schema: identity.schema, protocol: identity.protocol, version: identity.version, normalization: identity.normalization, artifactDigest: identity.artifactDigest },
        reachedInputsDigest: createHash("sha256").update(JSON.stringify(keys.map(key => [`../!FluxIQ/${key}`, identity.artifacts[key]]))).digest("hex") } };
    }
  });
}
