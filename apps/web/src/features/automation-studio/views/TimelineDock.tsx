"use client";

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
          return (
            <button
              className={props.selectedEntryId === entry.id ? `selected ${entry.type}` : entry.type}
              key={entry.id}
              onClick={() => props.onSelectAction(entry.id)}
              title={`${index + 1}. ${timelineEntryTitle(entry)}`}
              type="button"
            >
              <span className="automation-action-preview-order">{index + 1}</span>
              <span className="automation-action-preview-marker"><Icon size={13} aria-hidden /></span>
              <span className="automation-action-preview-label">{timelineEntryTitle(entry)}</span>
            </button>
          );
        })}
      </div> : <div className="automation-action-preview-empty"><strong>No actions yet</strong><span>State observations stay in the full timeline view.</span></div>}
    </footer>
  );
}
