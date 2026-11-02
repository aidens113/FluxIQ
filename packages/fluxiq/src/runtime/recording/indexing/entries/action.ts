import type { TimelineEntry } from "@fluxiq/contracts/recording";

export function recordingEntryIsActionLike(entry: TimelineEntry<unknown, unknown>): boolean {
  const type: string = entry.type;
  if (type === "action" || type === "client_action" || type === "recorded_action" || type === "interaction") return true;
  if ("actionType" in entry && typeof entry.actionType === "string" && entry.actionType.trim()) return true;
  return "action" in entry && Boolean(entry.action && typeof entry.action === "object" && !Array.isArray(entry.action));
}

export function recordingEntryActionId(entry: TimelineEntry<unknown, unknown>): string | undefined {
  return recordingEntryIsActionLike(entry) ? `action.${entry.id}` : undefined;
}

export function recordingEntryActionType(entry: TimelineEntry<unknown, unknown>): string {
  if ("actionType" in entry && typeof entry.actionType === "string" && entry.actionType.trim()) return entry.actionType.trim();
  if ("eventType" in entry && typeof entry.eventType === "string" && entry.eventType.trim()) return entry.eventType.trim();
  if ("outputId" in entry && typeof entry.outputId === "string" && entry.outputId.trim()) return entry.outputId.trim();
  return entry.type;
}
