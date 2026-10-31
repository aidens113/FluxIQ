import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANTHROPIC_MODELS } from "fluxiq/automation-studio/llm-models";
import { AiProviderSettingsSection } from "../AiProviderSettingsSection";
import { aiProviderKeyAvailability } from "../ai-provider-model";
import { buildFlowSettingsSavePayload, flowEffectiveSettings, flowLlmProvider, flowLlmSettingsErrors, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail } from "../flow-settings-model";
import { flowModelBinding } from "../../authoring";

const flow = { flowId: "flow.one", name: "Read my records", metadata: { llmProvider: "anthropic", llmModel: "claude-haiku-5-5", llmSecretKeyId: "secret.claude" } };
const key = { id: "secret.claude", name: "My Claude key", kind: "llm" as const, provider: "Anthropic", scope: "global" as const, enabled: true };

describe("Claude settings and authoring integration", () => {
  it("roundtrips explicit provider/model/key through saved settings and authoring readiness", () => {
    const draft = flowSettingsDraftFromFlow(flow);
    expect(draft).toMatchObject({ llmProvider: "anthropic", llmModel: "claude-haiku-5-5", llmSecretKeyId: "secret.claude" });
    expect(flowLlmProvider("anthropic")).toMatchObject({ label: "Anthropic (Claude)", models: AUTOMATION_STUDIO_ANTHROPIC_MODELS });
    expect(flowLlmSettingsErrors(draft, [key], true)).toEqual([]);
    const saved = buildFlowSettingsSavePayload(flow, draft);
    expect(saved.metadata).toMatchObject(flow.metadata);
    expect(flowSettingsDraftFromFlow({ ...flow, ...saved })).toMatchObject({ llmProvider: "anthropic", llmModel: "claude-haiku-5-5", llmSecretKeyId: "secret.claude" });
    const detail = flowSettingsFlowFromDetail({ flowId: flow.flowId, name: flow.name, settings: { llm: { provider: "anthropic", model: "claude-haiku-5-5", secretKeyId: key.id } } });
    expect(flowModelBinding("project.one", detail).ok).toBe(true);
    expect(flowLlmSettingsErrors({ ...draft, llmProvider: "deepseek" }, [key], true)).toContain("The selected model does not belong to the selected provider.");
    expect(flowEffectiveSettings(flow, draft).find((entry) => entry.key === "llmModel")).toMatchObject({ value: "claude-haiku-5-5", source: "Flow override" });
  });

  it("loads and saves a five-dollar test Flow without changing ordinary defaults", () => {
    const scoped = { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, maxCalls: 250, timeoutMs: 20000, maxEstimatedCostUsd: 5, retryCount: 0 } } };
    const draft = flowSettingsDraftFromFlow(scoped);
    expect(draft.llmMaxCostUsd).toBe("5");
    expect(flowLlmSettingsErrors(draft, [key], true)).toEqual([]);
    expect(buildFlowSettingsSavePayload(scoped, draft).metadata.llmExecutionSettings.maxEstimatedCostUsd).toBe(5);
    expect(flowSettingsDraftFromFlow(flow).llmMaxCostUsd).toBe("0.25");
    expect(flowLlmSettingsErrors({ ...draft, llmMaxCostUsd: "10.01" }, [key], true)).toContain("Diagnosis cost limit must be greater than 0 and no more than 10 USD.");
  });

  it("shows Claude key readiness and model labels without loading a secret value", () => {
    const availability = aiProviderKeyAvailability({ provider: "anthropic", keys: [key], loading: false, error: "" });
    expect(availability).toMatchObject({ status: "ready", usableKeys: [key] });
    expect(aiProviderKeyAvailability({ provider: "anthropic", keys: [{ ...key, provider: "DeepSeek" }], loading: false, error: "" }).status).toBe("missing");
    const html = renderToStaticMarkup(createElement(AiProviderSettingsSection, { draft: flowSettingsDraftFromFlow(flow), keyAvailability: availability, onDraftChange: () => undefined }));
    expect(html).toContain("Anthropic (Claude)");
    expect(html).toContain("claude-haiku-5-5");
    expect(html).toContain("My Claude key");
    expect(html).not.toContain("only provider");
  });
});
