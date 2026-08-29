"use client";

import { automationLayoutPresetOptions } from "../layout/defaults";
import type { AutomationLayoutPickerState, AutomationLayoutPreset, AutomationLayoutPresetOption, AutomationWorkspaceArea } from "../layout/contracts";
import { automationAreaLabel, automationFloatingPanelStyle } from "./primitives";

export function AutomationLayoutPicker(props: { area: AutomationWorkspaceArea; anchor: AutomationLayoutPickerState["anchor"]; onArrange(preset: AutomationLayoutPreset, area: AutomationWorkspaceArea): void }) {
  const options = automationLayoutOptionsForArea(props.area);
  return (
    <section className="automation-layout-picker-panel" style={automationFloatingPanelStyle(props.area, props.anchor, 320, 280)}>
      <header><strong>Arrange Windows</strong><span>{automationAreaLabel(props.area)}</span></header>
      <div className="automation-layout-picker-grid">
        {options.map((preset) => (
          <button key={preset.id} onClick={() => props.onArrange(preset.id, props.area)} title={preset.title} type="button">
            <span className="automation-layout-icon" aria-hidden>
              {preset.cells.map((cell, index) => <i key={index} style={{ left: `${cell.x * 100}%`, top: `${cell.y * 100}%`, width: `${cell.w * 100}%`, height: `${cell.h * 100}%` }} />)}
            </span>
            <span><strong>{preset.label}</strong><small>{preset.title}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function automationLayoutOptionsForArea(area: AutomationWorkspaceArea): AutomationLayoutPresetOption[] {
  if (area === "right") return automationLayoutPresetOptions.filter((item) => item.id === "single" || item.id === "two-rows");
  return automationLayoutPresetOptions.filter((item) => item.id !== "two-rows");
}

