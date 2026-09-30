"use client";

import { AlertCircle, AlertTriangle, CircleCheck, Info } from "lucide-react";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL } from "fluxiq/automation-studio/llm-models";
import { flowLlmProvider, type FlowSettingsDraft } from "./flow-settings-model";
import {
  AI_PROVIDER_ADAPTATION_OFF_EXPLANATION,
  AI_PROVIDER_ADAPTATION_ON_EXPLANATION,
  AI_PROVIDER_SECRET_KEYS_HREF,
  aiProviderAdaptationIsOn,
  applyAiProviderAdaptationSwitch,
  type DeepSeekKeyAvailability
} from "./ai-provider-model";

/**
 * Bring-your-own-key AI settings for one Flow: the DeepSeek key, which model
 * is in use, and whether the Flow may adapt. The model is chosen in the LLM
 * Connection section, which owns that field; this section only names it, so
 * Flow Settings never shows two pickers bound to one value. Controlled; the host owns the draft and
 * the key list, so this section adds no fetching and no second secret store.
 * Key values are never passed in and never rendered.
 */
export function AiProviderSettingsSection(props: {
  draft: FlowSettingsDraft;
  onDraftChange(update: (current: FlowSettingsDraft) => FlowSettingsDraft): void;
  keyAvailability: DeepSeekKeyAvailability;
  secretKeysHref?: string;
}) {
  const provider = flowLlmProvider("deepseek");
  const adaptationOn = aiProviderAdaptationIsOn(props.draft);
  const keysHref = props.secretKeysHref ?? AI_PROVIDER_SECRET_KEYS_HREF;
  const status = props.keyAvailability.status;
  return (
    <section className="automation-settings-panel automation-settings-panel-wide" id="flow-settings-ai-provider">
      <header><strong>AI Provider</strong><span>Bring your own {provider.label} API key. {provider.label} is the only provider for now.</span></header>
      <div className={`automation-settings-inline-notice${status === "ready" ? "" : status === "unknown" ? " error" : status === "loading" ? "" : " warning"}`} data-key-status={status} role={status === "unknown" ? "alert" : undefined}>
        {status === "ready" ? <CircleCheck size={16} aria-hidden /> : status === "unknown" ? <AlertCircle size={16} aria-hidden /> : status === "loading" ? <Info size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
        <span>{props.keyAvailability.summary}</span>
        {status === "loading" ? null : <a href={keysHref}>{status === "ready" ? "Manage keys" : `Add ${provider.label} key`}</a>}
      </div>
      <p className="automation-settings-ai-model">Model: <strong>{props.draft.llmModel || AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL}</strong> <a href="#flow-settings-llm">Change model</a></p>
      <label className="automation-settings-toggle">
        <input aria-label="Adaptation" checked={adaptationOn} onChange={(event) => { const on = event.target.checked; props.onDraftChange((current) => applyAiProviderAdaptationSwitch(current, on)); }} role="switch" type="checkbox" />
        <span>Adaptation {adaptationOn ? "on" : "off"}{props.draft.adaptationMode === "manual_approval" ? " (each change waits for your approval)" : ""}</span>
      </label>
      <small>{adaptationOn ? AI_PROVIDER_ADAPTATION_ON_EXPLANATION : AI_PROVIDER_ADAPTATION_OFF_EXPLANATION}</small>
    </section>
  );
}
