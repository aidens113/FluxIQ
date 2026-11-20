// The attempt's resolution on the model ladder (t962): every rung from the base up resolved as the
// attempt starts, the base the named model or Haiku where none was named, each call served on the
// rung the attempt's ladder stands on, the decider and the repair climbing one rung per climb, the
// judge staying on its start rung (t965), and a role off the ladder left where it is.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../../models/catalog/index.ts";
import { runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmModelLadder, automationStudioLlmRoleRoutedResolution, runWithAutomationStudioLlmModelLadder } from "../index.ts";

const request = (taskKind: string) => ({ requestId: "r", taskKind, context: {} }) as unknown as AutomationStudioLlmTaskRequest;

/** A host resolver on a Claude key: a provider bound to the model asked for, Sonnet by default. */
function resolver(asked: (string | undefined)[], extra: Record<string, AutomationStudioLlmProvider> = {}) {
  return async (input: AutomationStudioLlmProviderResolverInput): Promise<AutomationStudioLlmProviderResolution | undefined> => {
    asked.push(input.modelId);
    const model = input.modelId ?? "claude-sonnet-5-5";
    const provider: AutomationStudioLlmProvider = extra[model] ?? { metadata: { provider: model.startsWith("claude") ? "anthropic" : "mock", model }, runTask: async () => ({ model }) };
    return { provider, tokenLimits: { maxInputTokens: 9 } };
  };
}

const served = (resolution: AutomationStudioLlmProviderResolution | undefined, taskKind = "evidence_tool_decision") => (resolution?.provider.servedBy?.(request(taskKind)) ?? resolution?.provider)?.metadata.model;
const inFrame = <T>(models: NonNullable<AutomationStudioRunOverrides["models"]>, run: () => Promise<T>): Promise<T> => runWithAutomationStudioRunOverrides({ models }, run);

describe("the attempt's resolution on the model ladder", () => {
  it.skipIf(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED)("starts on Haiku where nothing named a model, and resolves every rung above it as the attempt starts", async () => {
    const asked: (string | undefined)[] = [];
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver(asked), { projectId: "p", flowId: "f" });
    expect(asked).toEqual([undefined, "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(resolution?.provider.metadata.model).toBe("claude-haiku-5-5");
    expect(served(resolution)).toBe("claude-haiku-5-5");
    expect(served(resolution, "loop_verification")).toBe("claude-haiku-5-5");
  });

  it("starts on the named model, and a named model off the ladder has none", async () => {
    const asked: (string | undefined)[] = [];
    const sonnet = await automationStudioLlmRoleRoutedResolution(resolver(asked), { projectId: "p", flowId: "f", modelId: "claude-sonnet-5-5" });
    expect(asked).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(served(sonnet)).toBe("claude-sonnet-5-5");
    const other: (string | undefined)[] = [];
    const off = await automationStudioLlmRoleRoutedResolution(resolver(other), { projectId: "p", flowId: "f", modelId: "deepseek-flash" });
    expect(other).toEqual(["deepseek-flash"]);
    expect(off?.provider.servedBy).toBeUndefined();
  });

  it("serves each call on the rung its attempt's ladder stands on: base first, one rung per climb, sticky, and a new attempt's ladder on the base again", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver([]), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      const models = [served(resolution)];
      // The provider told the attempt which models it climbs as it served.
      expect(attempt.models).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
      attempt.escalate({ reason: "loop_persisted" });
      models.push(served(resolution), served(resolution), served(resolution, "loop_verification"), served(resolution, "runtime_patch"));
      attempt.escalate({ reason: "loop_persisted" });
      attempt.escalate({ reason: "loop_persisted" });
      models.push(served(resolution));
      return models;
    });
    // The judge's call (the fourth) stays on the base: only the decider and the repair climbed (t965).
    expect(seen).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(runWithAutomationStudioLlmModelLadder(automationStudioLlmModelLadder(), () => served(resolution))).toBe("claude-haiku-5-5");
    // Outside every attempt's ladder: the base.
    expect(served(resolution)).toBe("claude-haiku-5-5");
  });

  it("runs the call on the model that serves it", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver([]), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const attempt = automationStudioLlmModelLadder();
    const ran = await runWithAutomationStudioLlmModelLadder(attempt, async () => {
      const first = await resolution!.provider.runTask(request("evidence_tool_decision"));
      attempt.escalate({ reason: "model_decided" });
      return [first, await resolution!.provider.runTask(request("evidence_tool_decision"))];
    });
    expect(ran).toEqual([{ model: "claude-haiku-5-5" }, { model: "claude-sonnet-5-5" }]);
  });

  // t965: run-mwodpw10-3d5748ab's judge climbed with the decider to Opus at $0.87 a check.
  it("serves the judge on the attempt's base model however far the decider has climbed, to the top", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver([]), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      served(resolution);
      attempt.escalate({ reason: "loop_persisted" });
      attempt.escalate({ reason: "loop_persisted" });
      return [served(resolution), served(resolution, "loop_verification")];
    });
    expect(seen).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
  });

  // t965 (user, 2026-11-19): a judge continuing the decider's conversation reads the decider's cache, which belongs to the decider's model.
  it("serves a judge that continues the decider's conversation on the decider's current model, and every other judge on the base", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver([]), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const continuing = { ...request("loop_verification"), metadata: { continuesDecider: true } } as AutomationStudioLlmTaskRequest;
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      const before = [served(resolution), (resolution?.provider.servedBy?.(continuing))?.metadata.model];
      attempt.escalate({ reason: "loop_persisted" });
      return [...before, served(resolution), (resolution?.provider.servedBy?.(continuing))?.metadata.model, served(resolution, "loop_verification")];
    });
    // Decider, continuing judge; after a climb: decider, continuing judge on the decider's model, a replay's or a trial's judge on the base.
    expect(seen).toEqual(["claude-haiku-5-5", "claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  });

  it("keeps a role's own stronger judge model where it is, and a role off the ladder where it is", async () => {
    const asked: (string | undefined)[] = [];
    const resolution = await inFrame({ judge: "claude-opus-5-5", repair: "mock-repair" }, async () => await automationStudioLlmRoleRoutedResolution(resolver(asked), { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" }));
    expect(asked).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "mock-repair", "claude-sonnet-5-5"]);
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      const before = [served(resolution), served(resolution, "loop_verification"), served(resolution, "runtime_patch")];
      attempt.escalate({ reason: "loop_persisted" });
      return [...before, served(resolution), served(resolution, "loop_verification"), served(resolution, "runtime_patch")];
    });
    expect(seen).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "mock-repair", "claude-sonnet-5-5", "claude-opus-5-5", "mock-repair"]);
  });

  it("ends the ladder below a rung above every start that cannot be resolved", async () => {
    const nothingForOpus = async (input: AutomationStudioLlmProviderResolverInput) => (input.modelId === "claude-opus-5-5" ? undefined : await resolver([])(input));
    const resolution = await automationStudioLlmRoleRoutedResolution(nothingForOpus, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      served(resolution);
      attempt.escalate({ reason: "loop_persisted" });
      const climbedAgain = attempt.escalate({ reason: "loop_persisted" });
      return [served(resolution), climbedAgain];
    });
    expect(seen).toEqual(["claude-sonnet-5-5", undefined]);
  });
});
