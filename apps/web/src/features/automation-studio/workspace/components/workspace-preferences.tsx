"use client";

import { automationBottomDockMaxHeight, automationBottomDockMinHeight, automationStrictMainLayoutPresets, defaultAutomationWorkspacePrefs } from "../layout/defaults";
import { defaultAutomationMainSplitRatios } from "../layout/mutations";
import type { AutomationStrictMainLayoutPreset, AutomationWorkspacePrefs } from "../layout/contracts";
import { PreferenceSlider } from "./primitives";

export function AutomationWorkspacePreferences(props: {
  prefs: AutomationWorkspacePrefs;
  saveStatus: string;
  setPrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs): void;
}) {
  const setNumber = (key: "sidebarWidth" | "inspectorWidth" | "bottomTimelineHeight", value: number) => props.setPrefs((current) => ({ ...current, [key]: value }));
  const setPreset = (preset: AutomationStrictMainLayoutPreset) => props.setPrefs((current) => ({
    ...current,
    mainLayoutPreset: preset,
    mainSplitRatios: defaultAutomationMainSplitRatios(preset)
  }));
  const resetLayout = () => props.setPrefs(() => defaultAutomationWorkspacePrefs());
  return (
    <div className="automation-preferences-panel">
      <section className="automation-preference-group" aria-labelledby="workspace-frame-preferences">
        <strong id="workspace-frame-preferences">Workspace Frame</strong>
        <PreferenceSlider label="Hierarchy width" max={420} min={220} unit="px" value={props.prefs.sidebarWidth} onChange={(value) => setNumber("sidebarWidth", value)} />
        <PreferenceSlider label="Inspector width" max={620} min={260} unit="px" value={props.prefs.inspectorWidth} onChange={(value) => setNumber("inspectorWidth", value)} />
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-editor-preferences">
        <strong id="workspace-editor-preferences">Main Editor</strong>
        <label className="automation-preference-row">
          <span>Layout</span>
          <select value={props.prefs.mainLayoutPreset} onChange={(event) => setPreset(event.target.value as AutomationStrictMainLayoutPreset)}>
            {automationStrictMainLayoutPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} - {preset.title}</option>)}
          </select>
          <output>{automationStrictMainLayoutPresets.find((preset) => preset.id === props.prefs.mainLayoutPreset)?.label}</output>
        </label>
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-timeline-preferences">
        <strong id="workspace-timeline-preferences">Action Preview</strong>
        <PreferenceSlider label="Dock height" max={automationBottomDockMaxHeight} min={automationBottomDockMinHeight} unit="px" value={props.prefs.bottomTimelineHeight} onChange={(value) => setNumber("bottomTimelineHeight", value)} />
        <label className="automation-preference-row">
          <span>Visible</span>
          <input checked={!props.prefs.bottomTimelineCollapsed} onChange={(event) => props.setPrefs((current) => ({ ...current, bottomTimelineCollapsed: !event.target.checked, bottomDock: { ...current.bottomDock, expanded: event.target.checked } }))} type="checkbox" />
          <output>{props.prefs.bottomTimelineCollapsed ? "Collapsed" : "Open"}</output>
        </label>
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-display-preferences">
        <strong id="workspace-display-preferences">Display</strong>
        <label className="automation-preference-row">
          <span>Density</span>
          <select value={props.prefs.density} onChange={(event) => props.setPrefs((current) => ({ ...current, density: event.target.value === "compact" ? "compact" : "comfortable" }))}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact operations</option>
          </select>
          <output>{props.prefs.density === "compact" ? "Compact" : "Comfort"}</output>
        </label>
        <label className="automation-preference-row">
          <span>Motion</span>
          <select value={props.prefs.motion} onChange={(event) => props.setPrefs((current) => ({ ...current, motion: event.target.value === "reduce" ? "reduce" : "system" }))}>
            <option value="system">Use system setting</option>
            <option value="reduce">Reduce motion</option>
          </select>
          <output>{props.prefs.motion === "reduce" ? "Reduced" : "System"}</output>
        </label>
      </section>
      <footer className="automation-preferences-footer">
        <output aria-live="polite" className="automation-preferences-save-status">{props.saveStatus}</output>
        <button className="button" onClick={resetLayout} type="button">Reset workspace layout</button>
      </footer>
    </div>
  );
}
