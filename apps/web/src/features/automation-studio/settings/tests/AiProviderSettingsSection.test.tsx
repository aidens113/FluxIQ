import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_MODELS } from "fluxiq/automation-studio/llm-models";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { AI_PROVIDER_ADAPTATION_OFF_EXPLANATION, AiProviderSettingsSection, SettingsView, deepSeekKeyAvailability, flowSettingsDraftFromFlow, readSettingsSection, type FlowSettingsDraft } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(draft: FlowSettingsDraft) {
  let current = draft;
  let renderer!: ReactTestRenderer;
  const availability = deepSeekKeyAvailability({ keys: [], loading: false, error: "" });
  const render = () => createElement(AiProviderSettingsSection, { draft: current, keyAvailability: availability, onDraftChange: (update) => { current = update(current); renderer.update(render()); } });
  act(() => { renderer = create(render()); });
  return { renderer, draft: () => current };
}

describe("AI provider settings section", () => {
  it("points to the Secret Keys program when no DeepSeek key exists and renders no key value", () => {
    const draft = flowSettingsDraftFromFlow({ flowId: "flow.a", name: "A", metadata: {} });
    const html = renderToStaticMarkup(createElement(AiProviderSettingsSection, { draft, keyAvailability: deepSeekKeyAvailability({ keys: [], loading: false, error: "" }), onDraftChange: () => undefined }));
    expect(html).toContain("AI Provider");
    expect(html).toContain("No DeepSeek API key has been added yet.");
    expect(html).toContain('href="/programs/secret-keys"');
    expect(html).toContain("Add DeepSeek key");
    const ready = renderToStaticMarkup(createElement(AiProviderSettingsSection, { draft, keyAvailability: deepSeekKeyAvailability({ keys: [{ id: "k", name: "Work key", kind: "llm", provider: "DeepSeek", scope: "global", enabled: true }], loading: false, error: "" }), onDraftChange: () => undefined }));
    expect(ready).toContain("Work key");
    expect(ready).toContain("Manage keys");
    expect(ready).not.toContain('type="password"');
  });

  it("names the model in use and defers choosing it to the LLM Connection section", () => {
    const choice = AUTOMATION_STUDIO_DEEPSEEK_MODELS.at(-1)!;
    const { renderer } = mount({ ...flowSettingsDraftFromFlow({ flowId: "flow.a", name: "A", metadata: {} }), llmModel: choice });
    expect(renderer.root.findAll((node) => node.type === "select")).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain(choice);
    expect(renderer.root.find((node) => node.type === "a" && node.props.href === "#flow-settings-llm")).toBeTruthy();
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html.match(/<select[^>]*aria-label="(?:AI model|Model)"/g)).toHaveLength(1);
  });

  it("switches adaptation off to no LLM intervention and back on to fully adaptive, explaining off", () => {
    const { renderer, draft } = mount(flowSettingsDraftFromFlow({ flowId: "flow.a", name: "A", metadata: {} }));
    const toggle = () => renderer.root.find((node) => node.type === "input" && node.props.role === "switch");
    expect(toggle().props.checked).toBe(true);
    act(() => toggle().props.onChange({ target: { checked: false } }));
    expect(draft().adaptationMode).toBe("no_llm_intervention");
    expect(toggle().props.checked).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain(AI_PROVIDER_ADAPTATION_OFF_EXPLANATION);
    act(() => toggle().props.onChange({ target: { checked: true } }));
    expect(draft().adaptationMode).toBe("fully_adaptive");
  });

  it("is mounted in Flow Settings and reachable as a settings section", () => {
    expect(readSettingsSection("?settingsSection=flow-settings-ai-provider", "flow")).toBe("flow-settings-ai-provider");
    expect(readSettingsSection("", "flow")).toBe("flow-settings-general");
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain('id="flow-settings-ai-provider"');
    expect(html).toContain('aria-controls="flow-settings-ai-provider"');
    // Without a project no key list is requested, which is not the same as having no key.
    expect(html).toContain("Your API keys have not been checked yet.");
  });
});
