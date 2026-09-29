import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { aiProviderAdaptationIsOn, applyAiProviderAdaptationSwitch, applyFlowAdaptationMode, deepSeekKeyAvailability, flowAdaptationErrors, flowSettingsDraftFromFlow, type AiProviderKeySummary } from "../index";

const key = (overrides: Partial<AiProviderKeySummary> = {}): AiProviderKeySummary => ({ id: "key.deepseek", name: "My DeepSeek", kind: "llm", provider: "DeepSeek", scope: "global", enabled: true, ...overrides });

describe("AI provider model", () => {
  it("maps the adaptation switch onto the existing adaptation modes", () => {
    const draft = flowSettingsDraftFromFlow({ flowId: "flow.a", name: "A", metadata: {} });
    expect(aiProviderAdaptationIsOn(draft)).toBe(true);
    const off = applyAiProviderAdaptationSwitch(draft, false);
    expect(off).toEqual(applyFlowAdaptationMode(draft, "no_llm_intervention"));
    expect(off).toMatchObject({ adaptationMode: "no_llm_intervention", allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false });
    expect(aiProviderAdaptationIsOn(off)).toBe(false);
    expect(flowAdaptationErrors(off)).toEqual([]);
    const on = applyAiProviderAdaptationSwitch(off, true);
    expect(on).toEqual(applyFlowAdaptationMode(off, "fully_adaptive"));
    expect(on).toMatchObject({ adaptationMode: "fully_adaptive", allowLlmIntervention: true, allowAdaptationCreation: true });
    expect(flowAdaptationErrors(on)).toEqual([]);
    expect(aiProviderAdaptationIsOn({ adaptationMode: "manual_approval" })).toBe(true);
  });

  it("finds a usable DeepSeek key without treating an unread list as empty", () => {
    expect(deepSeekKeyAvailability({ keys: [key()], loading: false, error: "" })).toMatchObject({ status: "ready", usableKeys: [{ id: "key.deepseek" }] });
    expect(deepSeekKeyAvailability({ keys: [key({ provider: "deep-seek" })], loading: false, error: "" }).status).toBe("ready");
    expect(deepSeekKeyAvailability({ keys: [], loading: false, error: "" }).status).toBe("missing");
    expect(deepSeekKeyAvailability({ keys: [key({ provider: "OpenAI" }), key({ kind: "custom" })], loading: false, error: "" }).status).toBe("missing");
    expect(deepSeekKeyAvailability({ keys: [key({ enabled: false })], loading: false, error: "" })).toMatchObject({ status: "unusable", summary: expect.stringContaining("disabled") });
    expect(deepSeekKeyAvailability({ keys: [key({ scope: "flow", scopeRef: "flow.other" })], loading: false, error: "" }).status).toBe("unusable");
    expect(deepSeekKeyAvailability({ keys: [key({ scope: "flow", scopeRef: "flow.a" })], loading: false, error: "", flowId: "flow.a" }).status).toBe("ready");
    expect(deepSeekKeyAvailability({ keys: null, loading: true, error: "" }).status).toBe("loading");
    expect(deepSeekKeyAvailability({ keys: null, loading: false, error: "denied" })).toMatchObject({ status: "unknown", summary: expect.stringContaining("denied") });
    expect(deepSeekKeyAvailability({ keys: null, loading: false, error: "" }).status).toBe("unknown");
  });
});
