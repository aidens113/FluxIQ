"use client";

import type { AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";
export function AutomationTimelineDock(props: { entries: any[]; notes: any[]; problems: any[]; setSelection(selection: AutomationSelection): void }) {
  return (
    <footer className="automation-bottom-dock">
      <div className="automation-dock-tabs"><strong>Timeline</strong><span>{props.entries.length} entries</span><span>{props.notes.length} notes</span><span>{props.problems.length} problems</span></div>
      <div className="automation-dock-scroll">
        {props.entries.map((entry) => (
          <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} type="button">
            <strong>{entry.sequence}</strong>
            <span>{entry.type}</span>
            <small>{timelineEntrySummary(entry)}</small>
          </button>
        ))}
      </div>
    </footer>
  );
}

