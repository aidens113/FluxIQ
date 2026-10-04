import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { FluxIQ } from "../index.ts";
it.each([false, true, undefined])("public construction forwards model provider admission %s", async (enabled) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-admission-"));
  const options = { rootDir: root, loadEnv: false, ...(enabled === undefined ? {} : { modelProvidersEnabled: enabled }) };
  const fluxiq = FluxIQ.create(options);
  try {
    expect(fluxiq.programs.automationStudio.getFlowBootstrapGenerationRuntimeReadiness().providerResolverConfigured).toBe(enabled !== false);
  } finally { await fluxiq.close(); await rm(root, { recursive: true, force: true }); }
});
