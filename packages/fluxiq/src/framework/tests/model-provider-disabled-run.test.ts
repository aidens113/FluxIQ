import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { FluxIQ } from "../index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../programs/automation-studio/index.ts";
import type { AutomationStudioNodeDefinition } from "../../programs/automation-studio/nodes/index.ts";
import { installPrimaryRouter } from "../../programs/automation-studio/runtime/tests/service-fixtures.ts";
import { SecretKeysService } from "../../programs/secret-keys/index.ts";

it("executes an ordinary saved native Flow without releasing a retained key or dispatching a model when construction disables providers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-disabled-provider-run-"));
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected fixture network dispatch");
  });
  const authorizationSpy = vi.spyOn(SecretKeysService.prototype, "createSessionRevealAuthorization");
  const revealSpy = vi.spyOn(SecretKeysService.prototype, "revealKeyWithAuthorization");
  let fluxiq: FluxIQ | undefined;
  let nativeCalls = 0;
  try {
    const definition: AutomationStudioNodeDefinition = {
      schemaVersion: "0.1", id: "fixture.echo", version: "1.0.0", label: "Fixture echo",
      description: "Returns a fixture value through the real native executor.", category: "Tests",
      source: { kind: "code", moduleId: "nodes/echo.ts", implementationKey: "echo", trust: "trusted-local" },
      availability: { kind: "domain", domainId: "fixture" },
      capabilities: { executable: true, codeBacked: true }, inputs: [],
      outputs: [{ id: "value", label: "Value", valueType: "string" }], parameters: []
    };
    const nativeNodeRuntime = new AutomationStudioNativeNodeRuntime().register({
      schemaVersion: "0.1", sdkVersion: "0.1", packageId: "fixture.package", packageVersion: "1.0.0",
      domainId: "fixture", nodes: [definition]
    }, {
      packageId: "fixture.package", packageVersion: "1.0.0",
      implementations: { echo: () => { nativeCalls += 1; return { outputs: { value: "fixture-result" } }; } }
    });
    fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, domainId: "fixture", nativeNodeRuntime, modelProvidersEnabled: false });
    await fluxiq.setup();
    const service = fluxiq.programs.automationStudio;
    const keys = fluxiq.programs.secretKeys;
    const identity = fluxiq.programs.identityAccess;
    const key = await keys.createKey({
      name: "Fixture DeepSeek", value: "fixture-only-provider-secret", provider: "deepseek",
      authorizationPassword: "fixture-only-password"
    });
    await keys.unlockSession({ sessionId: "fixture.session", userId: "fixture.user", authorizationPassword: "fixture-only-password", expiresAtMs: Date.now() + 60_000 });
    const keySnapshot = await keys.snapshot();
    expect(keySnapshot.keys).toContainEqual(expect.objectContaining({ id: key.id, enabled: true, kind: "llm" }));
    expect(JSON.stringify(keySnapshot)).not.toContain("fixture-only-provider-secret");
    expect(keys.activeSessionUnlockCount()).toBe(1);

    const project = await service.createProject({ name: "Disabled-provider fixture", domainId: "fixture" });
    const flow = await service.createFlow({ projectId: project.id, name: "Saved native fixture" });
    await installPrimaryRouter(service, project.id, flow.flowId, {
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "native", definitionId: "fixture.echo", parameterValues: {} },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.native", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "native", targetPortId: "in" },
        { id: "native.end", sourceNodeId: "native", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    });
    // An ordinary public run, not a direct executor call or an explicit model intent.
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(run.status).toBe("succeeded");
    expect(nativeCalls).toBe(1);
    expect(detail).toMatchObject({ summary: { runId: run.runId, status: "succeeded" }, interventions: [] });
    expect(detail?.actionAttempts).toContainEqual(expect.objectContaining({ nodeId: "native", status: "succeeded" }));
    expect(detail?.metadata?.llmGate).toEqual({
      invoked: false, ok: true,
      costAccounting: { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, pendingCalls: 0 },
      providerCalls: [], providerCallsOmitted: 0
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(authorizationSpy).not.toHaveBeenCalled();
    expect(revealSpy).not.toHaveBeenCalled();
    expect(fluxiq.programs.automationStudio).toBe(service);
    expect(fluxiq.programs.identityAccess).toBe(identity);
    expect(await keys.snapshot()).toEqual(keySnapshot);
    expect(keys.activeSessionUnlockCount()).toBe(1);
  } finally {
    await fluxiq?.close();
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}, 30_000);
