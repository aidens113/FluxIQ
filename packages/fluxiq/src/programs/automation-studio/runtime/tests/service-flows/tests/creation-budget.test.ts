// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
// Startup-scoped modules are collected before timed cases reload their warmed
// graph for each isolated host environment, as the session-key tests do.
import "../../../index.ts";
import "../../../service/flow-bootstrap-commands/index.ts";
import "../../../loop-limits/index.ts";
import "../../../llm/build-purse/index.ts";

async function runtime(value: string | undefined, scope = "test") {
  vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", scope);
  vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", value);
  vi.resetModules();
  const publicRuntime = await import("../../../index.ts");
  const limits = await import("../../../loop-limits/index.ts");
  const creation = await import("../../../service/flow-bootstrap-commands/index.ts");
  const purse = await import("../../../llm/build-purse/index.ts");
  const model = await import("../../../../model/index.ts");
  return {
    AutomationStudioService: publicRuntime.AutomationStudioService,
    createAutomationStudioSessionKeyProviderResolver: publicRuntime.createAutomationStudioSessionKeyProviderResolver,
    automationStudioLlmRunCostCeilingUsd: publicRuntime.automationStudioLlmRunCostCeilingUsd,
    automationStudioFlowBootstrapEvidenceLoopLimits: limits.automationStudioFlowBootstrapEvidenceLoopLimits,
    automationStudioFlowBootstrapCreationPurse: creation.automationStudioFlowBootstrapCreationPurse,
    automationStudioLlmCurrentFlowPurse: purse.automationStudioLlmCurrentFlowPurse,
    model
  };
}

type Runtime = Awaited<ReturnType<typeof runtime>>;
type Service = InstanceType<Runtime["AutomationStudioService"]>;
const services = new Set<Service>();
const roots = new Set<string>();

afterEach(async () => {
  for (const service of services) await service.close();
  services.clear();
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("fluxiq-budget-")) throw new Error("Unsafe budget fixture cleanup");
    await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  }
  roots.clear();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function createFlow(loaded: Runtime) {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-budget-"));
  roots.add(root);
  const service = new loaded.AutomationStudioService({ seedFixture: false, dataDir: root });
  services.add(service);
  const project = await service.createProject({ name: "Budget regression", domainId: "example" });
  const save = vi.spyOn(service, "saveFlow");
  const flow = await service.createFlow({ projectId: project.id, name: "Budget regression" });
  expect(save).toHaveBeenCalledOnce();
  expect(flow.scope).toEqual({ kind: "domain", domainId: project.domainId });
  expect(flow.flowId).toMatch(/^flow\.[0-9a-f-]{36}$/);
  expect(await service.getFlow(project.id, flow.flowId)).toEqual(flow);
  return { flow, service };
}

async function assertBudget(loaded: Runtime, service: Service, flow: AutomationStudioFlowArtifact, expected: number, carriedUsd = 0) {
  const providerCall = vi.fn(async () => { throw new Error("Budget resolution must not call a provider"); });
  const secretAccess = vi.fn(async () => { throw new Error("Budget resolution must not read a secret"); });
  const resolve = loaded.createAutomationStudioSessionKeyProviderResolver({
    ports: { snapshot: secretAccess, createSessionRevealAuthorization: secretAccess, revealKeyWithAuthorization: secretAccess, revokeRevealAuthorization: vi.fn() },
    fetchImpl: providerCall
  });
  const resolution = resolve({ projectId: flow.projectId, flowId: flow.flowId, caller: { actorUserId: "user.test", actorSessionId: "session.test" }, ...(flow.metadata ? { metadata: flow.metadata } : {}) })!;
  expect(resolution).toMatchObject({ maxEstimatedCostUsd: expected, maxTotalEstimatedCostUsd: expected });
  const policy = flow.metadata?.adaptationPolicySettings as { maxEstimatedCostUsdPerRun: number };
  const limits = loaded.automationStudioFlowBootstrapEvidenceLoopLimits(resolution, loaded.automationStudioLlmRunCostCeilingUsd(policy.maxEstimatedCostUsdPerRun));
  expect(limits.loop.budget.maxCostUsd).toBe(expected);

  // The actual service's persisted store carries earlier calls into both the
  // creation purse and its enclosing whole-Flow purse, without private ports.
  const store = service.creationSpends;
  if (carriedUsd) await store.add(flow.projectId, flow.flowId, carriedUsd, { phase: "build", calls: 1 });
  const creation = await loaded.automationStudioFlowBootstrapCreationPurse({
    store, projectId: flow.projectId, flowId: flow.flowId, repair: false, ceilingUsd: limits.loop.budget.maxCostUsd!
  });
  expect(creation.purse.ceilingUsd).toBe(expected);
  expect(creation.purse.carriedUsd).toBe(carriedUsd);
  await creation.run(async () => {
    const wholeFlow = loaded.automationStudioLlmCurrentFlowPurse();
    if (process.env.FLUXIQ_LLM_RUN_COST_CEILING_SCOPE === "test") {
      expect(wholeFlow?.ceilingUsd).toBe(loaded.automationStudioLlmRunCostCeilingUsd());
      expect(wholeFlow?.spentUsd()).toBe(carriedUsd);
    } else expect(wholeFlow).toBeUndefined();
    const held = creation.purse.hold({ projectedCostUsd: expected - carriedUsd, estimatedInputTokens: 100, maxOutputTokens: 10 });
    expect(held.ok).toBe(true);
    if (held.ok) held.hold.release();
    expect(creation.purse.hold({ projectedCostUsd: expected + 0.01, estimatedInputTokens: 100, maxOutputTokens: 10 })).toMatchObject({ ok: false, refusal: { ceilingUsd: expected } });
  });
  expect(providerCall).not.toHaveBeenCalled();
  expect(secretAccess).not.toHaveBeenCalled();
}

describe("public service fresh Flow budget propagation", () => {
  it("carries the scoped five-dollar allowance from actual public creation to the resolved build purse", async () => {
    const loaded = await runtime("5");
    const { flow, service } = await createFlow(loaded);
    expect(flow.metadata?.adaptationPolicySettings).toMatchObject({ maxEstimatedCostUsdPerRun: 5, allowRuntimeRecovery: true });
    expect(loaded.model.defaultAutomationStudioFlowSettingsMetadata().adaptationPolicySettings).toMatchObject({ maxEstimatedCostUsdPerRun: 0.25 });
    await assertBudget(loaded, service, flow, 5, 0.19);
  });

  it.each([[undefined, 0.1], ["0.05", 0.05]] as const)("uses the isolated default or explicit lower host ceiling %s", async (value, expected) => {
    const loaded = await runtime(value);
    const { flow, service } = await createFlow(loaded);
    expect(flow.metadata?.adaptationPolicySettings).toMatchObject({ maxEstimatedCostUsdPerRun: expected });
    await assertBudget(loaded, service, flow, expected);
  });

  it.each(["5", "bad"])("keeps ordinary public creation independent of the unscoped knob %s", async value => {
    const loaded = await runtime(value, "");
    const { flow, service } = await createFlow(loaded);
    expect(flow.metadata?.adaptationPolicySettings).toMatchObject({ maxEstimatedCostUsdPerRun: 0.25 });
    await assertBudget(loaded, service, flow, 0.25);
  });

  it("preserves explicitly saved lower policies, including the ordinary default's exact value", async () => {
    const loaded = await runtime("5");
    const { flow, service } = await createFlow(loaded);
    for (const lower of [0.25, 0.05]) {
      const configured = structuredClone(flow);
      (configured.metadata!.adaptationPolicySettings as { maxEstimatedCostUsdPerRun: number }).maxEstimatedCostUsdPerRun = lower;
      await service.saveFlow({ projectId: flow.projectId, flow: configured });
      const saved = await service.getFlow(flow.projectId, flow.flowId);
      await assertBudget(loaded, service, saved, lower);
      expect(saved.metadata?.adaptationPolicySettings).toMatchObject({ maxEstimatedCostUsdPerRun: lower });
    }
  });

  it("retains the public caller identity and overridden saveFlow facade", async () => {
    const loaded = await runtime("5");
    const { flow, service } = await createFlow(loaded);
    const save = vi.spyOn(service, "saveFlow");
    save.mockClear();
    save.mockImplementationOnce(async ({ flow: created }) => ({ ...created, description: "Saved through the public override" }));
    const next = await service.createFlow({ projectId: flow.projectId, flowId: "flow.caller-kept", name: "  Kept  " });
    expect(next).toMatchObject({ flowId: "flow.caller-kept", name: "Kept", description: "Saved through the public override" });
    expect(save).toHaveBeenCalledOnce();
    await expect(service.createFlow({ projectId: "missing", name: "" })).rejects.toThrow(/Unknown/);
    expect(save).toHaveBeenCalledOnce();
  });
});
