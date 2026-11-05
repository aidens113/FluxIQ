import type { FlowSettingsDraft } from "./flow-settings-model";

/**
 * One field edited by the person: the draft with it set. Editing the cost limit also marks it
 * edited, which the save sends to Core as "this limit was chosen" (`buildFlowSettingsSavePayload`),
 * so a person can keep exactly the $0.25 that is shown. No other field marks it.
 */
export function applyFlowSettingsField<K extends keyof FlowSettingsDraft>(draft: FlowSettingsDraft, key: K, value: FlowSettingsDraft[K]): FlowSettingsDraft {
  return { ...draft, [key]: value, ...(key === "maxAdaptationCostUsdPerRun" ? { maxAdaptationCostUsdPerRunEdited: true as const } : {}) };
}
