import { afterEach, expect, it, vi } from "vitest";
import { createGlobalProgramRuntime } from "../../index.ts";
import { SecretKeysService } from "../../secret-keys/index.ts";
const calls = vi.hoisted(() => ({ construct: vi.fn(), execution: vi.fn(), chat: vi.fn() }));
vi.mock("../../automation-studio/index.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../automation-studio/index.ts")>();
  return {
    ...original,
    AutomationStudioService: class extends original.AutomationStudioService {
      constructor(...args: ConstructorParameters<typeof original.AutomationStudioService>) { calls.construct(args[0]); super(...args); }
    },
    createAutomationStudioSessionKeyProviderResolver: (...args: Parameters<typeof original.createAutomationStudioSessionKeyProviderResolver>) => { calls.execution(); return original.createAutomationStudioSessionKeyProviderResolver(...args); },
    createAutomationStudioDeepSeekPanelCommandModel: (...args: Parameters<typeof original.createAutomationStudioDeepSeekPanelCommandModel>) => { calls.chat(); return original.createAutomationStudioDeepSeekPanelCommandModel(...args); }
  };
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
async function close(runtime: ReturnType<typeof createGlobalProgramRuntime>) { await runtime.automationStudio.close(); runtime.secretKeys.close(); }
it("disabled construction omits all three provider paths while retaining original services", async () => {
  const options = { modelProvidersEnabled: false };
  const reveal = vi.spyOn(SecretKeysService.prototype, "revealKeyWithAuthorization");
  const request = vi.spyOn(globalThis, "fetch");
  const runtime = createGlobalProgramRuntime(undefined, options);
  try {
    expect(calls.construct.mock.calls[0]?.[0]?.resultCheckProviderResolver).toBeUndefined();
    expect(calls.execution).not.toHaveBeenCalled(); expect(calls.chat).not.toHaveBeenCalled();
    expect(runtime.automationStudio.getFlowBootstrapGenerationRuntimeReadiness().providerResolverConfigured).toBe(false);
    expect(runtime.api).toBeDefined(); expect(runtime.identityAccess).toBeDefined(); expect(runtime.secretKeys).toBeDefined(); expect(runtime.automationStudioClientGateway).toBeDefined();
    expect(reveal).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  } finally { await close(runtime); }
});
it.each([undefined, { modelProvidersEnabled: true }])("default/enabled retains all original provider wiring: %j", async (options) => {
  const runtime = createGlobalProgramRuntime(undefined, options);
  try {
    expect(calls.construct.mock.calls[0]?.[0]?.resultCheckProviderResolver).toBeTypeOf("function");
    expect(calls.execution).toHaveBeenCalledOnce(); expect(calls.chat).toHaveBeenCalledOnce();
    expect(runtime.automationStudio.getFlowBootstrapGenerationRuntimeReadiness().providerResolverConfigured).toBe(true);
  } finally { await close(runtime); }
});
