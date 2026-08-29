"use client";

import { Crosshair } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { recordingEventIcon, recordingEventTitle } from "./recording-event-format";
import {
  recordingActionPreviewTargetIndex,
  type RecordingActionPreviewEntry,
  type RecordingActionPreviewModel
} from "./action-preview-model";

export function RecordingActionPreview(props: {
  model: RecordingActionPreviewModel;
  onSelectAction(entryId: string): void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const selectAt = (index: number) => {
    const entryId = props.model.orderedEntryIds[index];
    if (!entryId) return;
    props.onSelectAction(entryId);
    window.requestAnimationFrame(() => {
      railRef.current?.querySelector<HTMLButtonElement>('button[data-preview-entry-id="' + CSS.escape(entryId) + '"]')?.focus();
    });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = recordingActionPreviewTargetIndex(event.key, props.model.selectedIndex, props.model.total);
    if (index === null) return;
    event.preventDefault();
    selectAt(index);
  };
  useEffect(() => {
    if (!props.model.selectedEntryId) return;
    const id = CSS.escape(props.model.selectedEntryId);
    railRef.current?.querySelector<HTMLButtonElement>('button[data-preview-entry-id="' + id + '"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [props.model.selectedEntryId, props.model.start, props.model.end]);

  return (
    <footer className="automation-action-preview-dock">
      {props.model.total ? <><span className="automation-action-preview-range">Actions {props.model.start + 1}-{props.model.end} of {props.model.total}</span><div
        aria-label="Recording action preview"
        className="automation-action-preview-rail"
        onKeyDown={handleKeyDown}
        ref={railRef}
        style={{ gridTemplateColumns: "repeat(" + props.model.entries.length + ", minmax(132px, 1fr))" }}
      >
        {props.model.entries.map((entry, localIndex) => (
          <RecordingActionPreviewButton
            entry={entry}
            index={props.model.start + localIndex}
            key={entry.id}
            onSelect={() => props.onSelectAction(entry.id)}
            selected={props.model.selectedEntryId === entry.id}
          />
        ))}
      </div></> : <div className="automation-action-preview-empty"><strong>No actions yet</strong><span>State observations stay in the full timeline view.</span></div>}
    </footer>
  );
}

function RecordingActionPreviewButton(props: {
  entry: RecordingActionPreviewEntry;
  index: number;
  onSelect(): void;
  selected: boolean;
}) {
  const Icon = recordingEventIcon(props.entry.type);
  const visualTarget = actionVisualTarget(props.entry);
  const targetLabel = visualTargetLabel(visualTarget);
  const title = recordingEventTitle(props.entry);
  return (
    <button
      aria-label={String(props.index + 1) + ". " + title + (targetLabel ? "; interacted with " + targetLabel : "")}
      aria-pressed={props.selected}
      className={(props.selected ? "selected " + props.entry.type : props.entry.type) + (visualTarget ? " has-visual-target" : "")}
      data-preview-entry-id={props.entry.id}
      onClick={props.onSelect}
      title={String(props.index + 1) + ". " + title + (targetLabel ? " | Interacted: " + targetLabel : "")}
      type="button"
    >
      <span className="automation-action-preview-order">{props.index + 1}</span>
      {visualTarget ? <span aria-label={"Interacted entity: " + targetLabel} className="automation-action-preview-target"><Crosshair aria-hidden size={11} /></span> : null}
      <span className="automation-action-preview-marker"><Icon aria-hidden size={13} /></span>
      <span className="automation-action-preview-label">{title}</span>
    </button>
  );
}

function actionVisualTarget(entry: RecordingActionPreviewEntry): Record<string, unknown> | null {
  const target = entry.visualTarget;
  return target && typeof target === "object" && !Array.isArray(target) ? target as Record<string, unknown> : null;
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
  return namespace && path ? namespace + "." + path : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}