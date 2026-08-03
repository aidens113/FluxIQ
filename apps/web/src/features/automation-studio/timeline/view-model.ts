import { AlertTriangle, Blocks, CircleDot, Database, FileText, GitBranch, Radio, Search, Zap } from "lucide-react";

export function buildTimelineInspectorSections(entry: any, entries: any[], recording: any): Array<{ title: string; rows: Array<[string, string]> }> {
  const sortedEntries = [...entries].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0));
  const index = sortedEntries.findIndex((item) => item.id === entry.id);
  const previous = index > 0 ? sortedEntries[index - 1] : null;
  const next = index >= 0 && index < sortedEntries.length - 1 ? sortedEntries[index + 1] : null;
  const offset = Number(entry.monotonicOffsetMs ?? 0);
  const gapBefore = previous ? Math.max(0, offset - Number(previous.monotonicOffsetMs ?? 0)) : offset;
  const gapAfter = next ? Math.max(0, Number(next.monotonicOffsetMs ?? 0) - offset) : 0;
  const sections: Array<{ title: string; rows: Array<[string, string]> }> = [{
    title: "Event",
    rows: [
      ["Title", timelineEntryTitle(entry)],
      ["Summary", timelineEntrySummary(entry)],
      ["Type", readableToken(entry.type ?? "event")],
      ["Sequence", index >= 0 ? `${index + 1} of ${sortedEntries.length}` : String(entry.sequence ?? "-")],
      ["Source", sourceLabel(recording, entry.sourceId)],
      ["Confidence", typeof entry.confidence === "number" ? `${Math.round(entry.confidence * 100)}%` : "-"]
    ]
  }, {
    title: "Timing",
    rows: [
      ["Recorded offset", formatTimelineDuration(offset)],
      ["Gap before", formatTimelineDuration(gapBefore)],
      ["Gap after", next ? formatTimelineDuration(gapAfter) : "-"],
      ["Timestamp", entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "-"],
      ["Delay source", "Recorded monotonic gaps"]
    ]
  }];
  const detailRows = timelineEntryDetailRows(entry);
  if (detailRows.length) sections.push({ title: "Details", rows: detailRows });
  const linkageRows: Array<[string, string]> = [
    ["Recording", entry.recordingId ?? recording?.recordingId ?? "-"],
    ["Correlation", entry.correlationId ?? "-"],
    ["Causation", entry.causationId ?? "-"],
    ["Metadata", readableObjectSummary(entry.metadata)]
  ];
  sections.push({ title: "Links", rows: linkageRows });
  return sections;
}

export function timelineEntryDetailRows(entry: any): Array<[string, string]> {
  if (entry.type === "action") return [
    ["Action", readableToken(entry.actionType ?? "action")],
    ["Origin", readableToken(entry.origin ?? "-")],
    ["Target", entry.target?.label ?? entry.target?.id ?? "-"],
    ["Parameters", readableObjectSummary(entry.parameters)],
    ["Started", entry.startedAt ? new Date(entry.startedAt).toLocaleString() : "-"],
    ["Completed", entry.completedAt ? new Date(entry.completedAt).toLocaleString() : "-"],
    ["Result", actionResultSummary(entry.result)]
  ];
  if (entry.type === "domain_event") return [
    ["Event", readableToken(entry.eventType ?? "domain event")],
    ["Payload", readableObjectSummary(entry.payload)]
  ];
  if (entry.type === "observation") return [
    ["Observation", readableToken(entry.observationType ?? "observation")],
    ["Signals", readableObjectSummary(entry.signals)],
    ["Payload", readableObjectSummary(entry.payload)]
  ];
  if (entry.type === "state_delta") return [
    ["Changes", String(entry.deltas?.length ?? 0)],
    ["Changed paths", (entry.deltas ?? []).slice(0, 8).map((delta: any) => `${delta.path} (${readableToken(delta.change ?? "changed")})`).join(", ") || "-"]
  ];
  if (entry.type === "state_checkpoint") return [
    ["Namespaces", String(Object.keys(entry.state?.namespaces ?? {}).length)],
    ["State time", entry.state?.timestamp ? new Date(entry.state.timestamp).toLocaleString() : "-"]
  ];
  if (entry.type === "note") return [["Note", entry.noteId ?? "-"]];
  if (entry.type === "marker") return [["Marker", entry.label ?? "-"]];
  return [];
}

export function sourceLabel(recording: any, sourceId: unknown): string {
  const id = typeof sourceId === "string" ? sourceId : "";
  const source = (recording?.sources ?? []).find((item: any) => item.id === id);
  if (!source) return id || "-";
  return `${source.label ?? source.id} (${source.kind ?? "source"})`;
}

export function readableObjectSummary(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "-";
  return entries.slice(0, 6).map(([key, item]) => `${readableToken(key)}: ${simpleValue(item)}`).join(", ");
}

export function simpleValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  return String(value);
}

export function actionResultSummary(result: any): string {
  if (!result) return "-";
  return [result.status, result.message, result.error].filter(Boolean).join(" | ") || readableObjectSummary(result);
}

export function timelineEntrySummary(entry: any): string {
  if (entry.type === "action") return `${entry.actionType} ${entry.target?.label ?? entry.target?.id ?? ""}`.trim();
  if (entry.type === "state_delta") return (entry.deltas ?? []).map((delta: any) => `${delta.path} ${delta.change}`).join(", ");
  if (entry.type === "state_checkpoint") return `${Object.keys(entry.state?.namespaces ?? {}).length} namespaces`;
  if (entry.type === "note") return entry.noteId;
  if (entry.type === "domain_event") return entry.eventType;
  if (entry.type === "observation") return entry.observationType;
  if (entry.type === "marker") return entry.label;
  return shortJson(entry);
}

export function isRejectedRecordingMarker(entry: any): boolean {
  return entry?.type === "marker" && typeof entry.label === "string" && entry.label.startsWith("Rejected recording event:");
}

export function timelineEntryTitle(entry: any, note?: any): string {
  if (entry.type === "action") return readableToken(entry.actionType ?? "Action");
  if (entry.type === "domain_event") return readableToken(entry.eventType ?? "Domain event");
  if (entry.type === "observation") return readableToken(entry.observationType ?? "Observation");
  if (entry.type === "state_delta") return `${entry.deltas?.length ?? 0} State Change${entry.deltas?.length === 1 ? "" : "s"}`;
  if (entry.type === "state_checkpoint") return "State Checkpoint";
  if (entry.type === "note") return note?.text ?? "Timeline Note";
  if (entry.type === "marker") return entry.label ?? "Marker";
  return readableToken(entry.type ?? "Timeline event");
}

export function timelineEntryIcon(type: string): typeof Blocks {
  switch (type) {
    case "action": return Zap;
    case "domain_event": return Radio;
    case "observation": return Search;
    case "state_delta": return GitBranch;
    case "state_checkpoint": return Database;
    case "note": return FileText;
    case "marker": return AlertTriangle;
    default: return CircleDot;
  }
}

export function formatTimelineDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${trimNumber(value / 1000)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  if (minutes < 60) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export function readableToken(value: string): string {
  return value
    .replace(/[_:.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function conditionSummary(group: any): string {
  if (!group) return "-";
  const conditions = group.conditions ?? [];
  if (!conditions.length) return `${group.type ?? "condition"}: empty`;
  return `${group.type}: ${conditions.map((condition: any) => condition.signalPath ? `${condition.signalPath} ${condition.operator}` : conditionSummary(condition)).join("; ")}`;
}

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}
