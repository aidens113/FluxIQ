"use client";

import { Crosshair } from "lucide-react";
import { useMemo } from "react";
import { timelineEntryIcon, timelineEntryTitle } from "../timeline/view-model";

export function AutomationTimelineDock(props: {
  entries: any[];
  selectedEntryId?: string;
  selectedRecording: any;
  onSelectAction(entryId: string): void;
}) {
  const actionEntries = useMemo(() => props.entries
    .filter((entry) => entry?.type === "action" || entry?.type === "domain_event")
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0)), [props.entries]);

  return (
    <footer className="automation-action-preview-dock">
      {actionEntries.length ? <div
        className="automation-action-preview-rail"
        style={{ gridTemplateColumns: `repeat(${actionEntries.length}, minmax(132px, 1fr))` }}
        aria-label="Recording action preview"
      >
        {actionEntries.map((entry, index) => {
          const Icon = timelineEntryIcon(entry.type);
          const visualTarget = actionVisualTarget(entry);
          const targetLabel = visualTargetLabel(visualTarget);
          return (
            <button
              className={`${props.selectedEntryId === entry.id ? `selected ${entry.type}` : entry.type}${visualTarget ? " has-visual-target" : ""}`}
              key={entry.id}
              onClick={() => props.onSelectAction(entry.id)}
              title={`${index + 1}. ${timelineEntryTitle(entry)}${targetLabel ? ` | Interacted: ${targetLabel}` : ""}`}
              type="button"
            >
              <span className="automation-action-preview-order">{index + 1}</span>
              {visualTarget ? <span className="automation-action-preview-target" aria-label={`Interacted entity: ${targetLabel}`}><Crosshair size={11} aria-hidden /></span> : null}
              <span className="automation-action-preview-marker"><Icon size={13} aria-hidden /></span>
              <span className="automation-action-preview-label">{timelineEntryTitle(entry)}</span>
            </button>
          );
        })}
      </div> : <div className="automation-action-preview-empty"><strong>No actions yet</strong><span>State observations stay in the full timeline view.</span></div>}
    </footer>
  );
}

function actionVisualTarget(entry: any): Record<string, unknown> | null {
  const target = entry?.visualTarget;
  return target && typeof target === "object" && !Array.isArray(target) ? target : null;
}

function visualTargetLabel(target: Record<string, unknown> | null): string {
  if (!target) return "";
  const entityId = stringValue(target.entityId);
  const entityKind = stringValue(target.entityKind);
  const statePath = statePathLabel(target.statePath);
  return [entityKind, entityId ?? statePath ?? "target"].filter(Boolean).join(" ");
}

function statePathLabel(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const namespace = stringValue(record.namespace);
  const path = stringValue(record.path);
  return namespace && path ? `${namespace}.${path}` : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
