// The host gives Automation Studio the candidate start hook (decision D1)
// only from deployment configuration (t348): unset -- every product
// deployment -- leaves the service without one, and readiness says so; the
// Lab's variables give the service a hook, and readiness says that.

import { afterEach, expect, it, vi } from "vitest";
import { createGlobalProgramRuntime } from "../../index.ts";

afterEach(() => { vi.unstubAllEnvs(); });

async function close(runtime: ReturnType<typeof createGlobalProgramRuntime>) { await runtime.automationStudio.close(); runtime.secretKeys.close(); }

it("constructs the service without a start hook when the deployment sets none", async () => {
  vi.stubEnv("FLUXIQ_CANDIDATE_START_URL", undefined);
  vi.stubEnv("FLUXIQ_CANDIDATE_START_TOKEN", undefined);
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  try {
    expect(runtime.automationStudio.getFlowBootstrapGenerationRuntimeReadiness().candidateTrial).toEqual({ runner: true, startReset: false });
  } finally { await close(runtime); }
});

it("constructs the service with the deployment's start hook when it sets one", async () => {
  vi.stubEnv("FLUXIQ_CANDIDATE_START_URL", "http://127.0.0.1:41234/__control/reset");
  vi.stubEnv("FLUXIQ_CANDIDATE_START_TOKEN", "lab-run-token-0123456789");
  const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
  try {
    expect(runtime.automationStudio.getFlowBootstrapGenerationRuntimeReadiness().candidateTrial).toEqual({ runner: true, startReset: true });
  } finally { await close(runtime); }
});

it("refuses to start on a half-set configuration", () => {
  vi.stubEnv("FLUXIQ_CANDIDATE_START_URL", undefined);
  vi.stubEnv("FLUXIQ_CANDIDATE_START_TOKEN", "lab-run-token-0123456789");
  expect(() => createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false })).toThrow(/FLUXIQ_CANDIDATE_START_TOKEN is set without FLUXIQ_CANDIDATE_START_URL/u);
});
