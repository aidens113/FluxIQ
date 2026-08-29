export function settingsDraftIsDirty(current: unknown, saved: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

const FLOW_SETTINGS_SECTIONS = ["flow-settings-general", "flow-settings-runtime", "flow-settings-llm", "flow-settings-adaptation", "flow-settings-limits", "flow-settings-safety", "flow-settings-inputs", "flow-settings-dependencies", "flow-settings-effective"] as const;
const SUBFLOW_SETTINGS_SECTIONS = ["subflow-settings-general", "subflow-settings-routing", "subflow-settings-inputs", "subflow-settings-outputs", "subflow-settings-lifecycle"] as const;

export function readSettingsSection(search: string, kind: "flow" | "subflow"): string {
  const allowed = kind === "flow" ? FLOW_SETTINGS_SECTIONS : SUBFLOW_SETTINGS_SECTIONS;
  const value = new URLSearchParams(search).get("settingsSection") ?? "";
  return (allowed as readonly string[]).includes(value) ? value : allowed[0];
}

export function scrollToSettingsSection(sectionId: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
}
