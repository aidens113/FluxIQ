import type { AutomationWindowAdderState, AutomationWorkspaceArea } from "../layout/contracts";

export function automationAreaLabel(area: AutomationWorkspaceArea): string {
  if (area === "right") return "Right Sidebar";
  return "Main";
}

export function automationFloatingPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"], maxWidth: number, maxHeight: number) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(maxWidth, window.innerWidth - 48);
  const height = Math.min(maxHeight, window.innerHeight - 126);
  const left = area === "right"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}


export function PreferenceSlider(props: { label: string; min: number; max: number; unit: string; value: number; note?: string; onChange(value: number): void }) {
  return (
    <label className="automation-preference-row">
      <span>{props.label}</span>
      <input max={props.max} min={props.min} onChange={(event) => props.onChange(Number(event.target.value))} type="range" value={props.value} />
      <output>{props.note ?? `${props.value}${props.unit}`}</output>
    </label>
  );
}

