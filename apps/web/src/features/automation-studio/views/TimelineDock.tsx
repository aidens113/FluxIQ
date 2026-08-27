"use client";

import { Crosshair } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { timelineEntryIcon, timelineEntryTitle } from "../timeline/view-model";

export function AutomationTimelineDock(props: {
  entries: any[];
  selectedEntryId?: string;
  selectedRecording: any;
  onSelectAction(entryId: string): void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const actionEntries = useMemo(() => props.entries
    .filter((entry) => entry?.type === "action" || entry?.type === "domain_event")
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0)), [props.entries]);
  const selectedIndex = actionEntries.findIndex((entry) => entry.id === props.selectedEntryId);
  const actionWindow = bottomTimelineWindow(actionEntries.length, selectedIndex, 200);
  const visibleActionEntries = actionEntries.slice(actionWindow.start, actionWindow.end);
  const selectAt = (index: number) => {
    const entry = actionEntries[index];
    if (!entry) return;
    props.onSelectAction(entry.id);
    window.requestAnimationFrame(() => railRef.current?.querySelectorAll<HTMLButtonElement>("button")[index]?.focus());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = bottomTimelineTargetIndex(event.key, selectedIndex, actionEntries.length);
    if (index === null) return;
    event.preventDefault();
    selectAt(index);
  };
  useEffect(() => {
    const target = [...(railRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => button.dataset.previewEntryId === props.selectedEntryId);
    target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [props.selectedEntryId, actionEntries.length]);

  return (
    <footer className="automation-action-preview-dock">
      {actionEntries.length ? <><span className="automation-action-preview-range">Actions {actionWindow.start + 1}-{actionWindow.end} of {actionEntries.length}</span><div
        className="automation-action-preview-rail"
        ref={railRef}
        onKeyDown={handleKeyDown}
        style={{ gridTemplateColumns: `repeat(${visibleActionEntries.length}, minmax(132px, 1fr))` }}
        aria-label="Recording action preview"
      >
        {visibleActionEntries.map((entry, localIndex) => {
          const index = actionWindow.start + localIndex;
          const Icon = timelineEntryIcon(entry.type);
          const visualTarget = actionVisualTarget(entry);
          const targetLabel = visualTargetLabel(visualTarget);
          return (
            <button
              className={`${props.selectedEntryId === entry.id ? `selected ${entry.type}` : entry.type}${visualTarget ? " has-visual-target" : ""}`}
              aria-label={`${index + 1}. ${timelineEntryTitle(entry)}${targetLabel ? `; interacted with ${targetLabel}` : ""}`}
              aria-pressed={props.selectedEntryId === entry.id}
              data-preview-entry-id={entry.id}
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
      </div></> : <div className="automation-action-preview-empty"><strong>No actions yet</strong><span>State observations stay in the full timeline view.</span></div>}
    </footer>
  );
}

export function bottomTimelineWindow(length: number, selectedIndex: number, size: number) {
  const safeSize = Math.max(1, Math.trunc(size));
  const center = selectedIndex < 0 ? 0 : selectedIndex;
  const start = Math.min(Math.max(0, length - safeSize), Math.max(0, center - Math.floor(safeSize / 2)));
  return { start, end: Math.min(length, start + safeSize) };
}

export function bottomTimelineTargetIndex(key: string, selectedIndex: number, length: number): number | null {
  if (!length) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowLeft") return Math.max(0, selectedIndex < 0 ? 0 : selectedIndex - 1);
  if (key === "ArrowRight") return Math.min(length - 1, selectedIndex < 0 ? 0 : selectedIndex + 1);
  return null;
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
