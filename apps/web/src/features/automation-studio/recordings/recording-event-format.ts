import { AlertTriangle, Blocks, CircleDot, Database, FileText, GitBranch, Radio, Search, Zap } from "lucide-react";

export function buildRecordingEventInspectorSections(entry: any, entries: any[], recording: any): Array<{ title: string; rows: Array<[string, string]> }> {
  const sortedEntries = [...entries].sort(compareRecordingEvents);
  const index = sortedEntries.findIndex((item) => item.id === entry.id);
  const previous = index > 0 ? sortedEntries[index - 1] : null;
  const next = index >= 0 && index < sortedEntries.length - 1 ? sortedEntries[index + 1] : null;
  const offset = Number(entry.monotonicOffsetMs ?? 0);
  const sections: Array<{ title: string; rows: Array<[string, string]> }> = [{
    title: "Event",
    rows: [
      ["Title", recordingEventTitle(entry)],
      ["Summary", recordingEventSummary(entry)],
      ["Type", readableRecordingToken(entry.type ?? "event")],
      ["Sequence", index >= 0 ? `${index + 1} of ${sortedEntries.length}` : String(entry.sequence ?? "-")],
      ["Source", recordingSourceLabel(recording, entry.sourceId)],
      ["Confidence", typeof entry.confidence === "number" ? `${Math.round(entry.confidence * 100)}%` : "-"]
    ]
  }, {
    title: "Timing",
    rows: [
      ["Recorded offset", formatRecordingDuration(offset)],
      ["Gap before", formatRecordingDuration(previous ? Math.max(0, offset - Number(previous.monotonicOffsetMs ?? 0)) : offset)],
      ["Gap after", next ? formatRecordingDuration(Math.max(0, Number(next.monotonicOffsetMs ?? 0) - offset)) : "-"],
      ["Timestamp", entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "-"],
      ["Delay source", "Recorded monotonic gaps"]
    ]
  }];
  const details = recordingEventDetailRows(entry);
  if (details.length) sections.push({ title: "Details", rows: details });
  sections.push({
    title: "Links",
    rows: [
      ["Recording", entry.recordingId ?? recording?.recordingId ?? "-"],
      ["Correlation", entry.correlationId ?? "-"],
      ["Causation", entry.causationId ?? "-"],
      ["Metadata", readableRecordingObject(entry.metadata)]
    ]
  });
  return sections;
}

export function recordingEventSummary(entry: any): string {
  if (entry.type === "action") return `${entry.actionType} ${entry.target?.label ?? entry.target?.id ?? ""}`.trim();
  if (entry.type === "state_delta") return (entry.deltas ?? []).map((delta: any) => `${delta.path} ${delta.change}`).join(", ");
  if (entry.type === "state_checkpoint") return `${Object.keys(entry.state?.namespaces ?? {}).length} namespaces`;
  if (entry.type === "note") return entry.noteId;
  if (entry.type === "domain_event") return entry.eventType;
  if (entry.type === "observation") return entry.observationType;
  if (entry.type === "marker") return entry.label;
  return shortRecordingJson(entry);
}

export function recordingEventTitle(entry: any, note?: any): string {
  if (entry.type === "action") return readableRecordingToken(entry.actionType ?? "Action");
  if (entry.type === "domain_event") return readableRecordingToken(entry.eventType ?? "Domain event");
  if (entry.type === "observation") return readableRecordingToken(entry.observationType ?? "Observation");
  if (entry.type === "state_delta") return `${entry.deltas?.length ?? 0} State Change${entry.deltas?.length === 1 ? "" : "s"}`;
  if (entry.type === "state_checkpoint") return "State Checkpoint";
  if (entry.type === "note") return note?.text ?? "Timeline Note";
  if (entry.type === "marker") return entry.label ?? "Marker";
  return readableRecordingToken(entry.type ?? "Timeline event");
}

export function recordingEventIcon(type: string): typeof Blocks {
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

export function formatRecordingDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${trimNumber(value / 1000)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  if (minutes < 60) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function recordingEventDetailRows(entry: any): Array<[string, string]> {
  if (entry.type === "action") return [
    ["Action", readableRecordingToken(entry.actionType ?? "action")],
    ["Origin", readableRecordingToken(entry.origin ?? "-")],
    ["Target", entry.target?.label ?? entry.target?.id ?? "-"],
    ["Parameters", readableRecordingObject(entry.parameters)],
    ["Result", [entry.result?.status, entry.result?.message, entry.result?.error].filter(Boolean).join(" | ") || readableRecordingObject(entry.result)]
  ];
  if (entry.type === "domain_event") return [["Event", readableRecordingToken(entry.eventType ?? "domain event")], ["Payload", readableRecordingObject(entry.payload)]];
  if (entry.type === "observation") return [["Observation", readableRecordingToken(entry.observationType ?? "observation")], ["Signals", readableRecordingObject(entry.signals)], ["Payload", readableRecordingObject(entry.payload)]];
  if (entry.type === "state_delta") return [["Changes", String(entry.deltas?.length ?? 0)], ["Changed paths", (entry.deltas ?? []).slice(0, 8).map((delta: any) => `${delta.path} (${readableRecordingToken(delta.change ?? "changed")})`).join(", ") || "-"]];
  if (entry.type === "state_checkpoint") return [["Namespaces", String(Object.keys(entry.state?.namespaces ?? {}).length)], ["State time", entry.state?.timestamp ? new Date(entry.state.timestamp).toLocaleString() : "-"]];
  if (entry.type === "note") return [["Note", entry.noteId ?? "-"]];
  if (entry.type === "marker") return [["Marker", entry.label ?? "-"]];
  return [];
}

function compareRecordingEvents(left: any, right: any): number {
  return (left.sequence ?? 0) - (right.sequence ?? 0) || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0);
}

function recordingSourceLabel(recording: any, sourceId: unknown): string {
  const id = typeof sourceId === "string" ? sourceId : "";
  const source = (recording?.sources ?? []).find((item: any) => item.id === id);
  return source ? `${source.label ?? source.id} (${source.kind ?? "source"})` : id || "-";
}

function readableRecordingObject(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "-";
  return entries.slice(0, 6).map(([key, item]) => `${readableRecordingToken(key)}: ${simpleRecordingValue(item)}`).join(", ");
}

function simpleRecordingValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  return String(value);
}

function readableRecordingToken(value: string): string {
  return value.replace(/[_:.]+/g, " ").split(/\s+/).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function shortRecordingJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}