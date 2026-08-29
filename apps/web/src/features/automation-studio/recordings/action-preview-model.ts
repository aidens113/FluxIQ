export const recordingActionPreviewWindowSize = 200;

export type RecordingActionPreviewEntry = {
  id: string;
  type: "action" | "domain_event";
  sequence?: number;
  monotonicOffsetMs?: number;
  actionType?: string;
  visualTarget?: unknown;
  [key: string]: unknown;
};

export type RecordingActionPreviewIndex = {
  orderedEntries: readonly RecordingActionPreviewEntry[];
  orderedEntryIds: readonly string[];
};

export type RecordingActionPreviewModel = {
  entries: readonly RecordingActionPreviewEntry[];
  orderedEntryIds: readonly string[];
  selectedEntryId?: string;
  selectedIndex: number;
  start: number;
  end: number;
  total: number;
};

const projectionCache = new WeakMap<RecordingActionPreviewIndex, {
  model: RecordingActionPreviewModel;
  selectedEntryId?: string;
  size: number;
}>();

export function createRecordingActionPreviewIndex(entries: readonly unknown[]): RecordingActionPreviewIndex {
  const orderedEntries = [...entries.filter(isRecordingActionPreviewEntry)].sort(comparePreviewEntries);
  return {
    orderedEntries,
    orderedEntryIds: orderedEntries.map((entry) => entry.id)
  };
}

export function projectRecordingActionPreview(
  index: RecordingActionPreviewIndex,
  selectedEntryId?: string,
  size = recordingActionPreviewWindowSize
): RecordingActionPreviewModel {
  const cached = projectionCache.get(index);
  if (cached && cached.selectedEntryId === selectedEntryId && cached.size === size) return cached.model;
  const selectedIndex = index.orderedEntryIds.indexOf(selectedEntryId ?? "");
  const window = recordingActionPreviewWindow(index.orderedEntries.length, selectedIndex, size);
  const model: RecordingActionPreviewModel = {
    entries: index.orderedEntries.slice(window.start, window.end),
    orderedEntryIds: index.orderedEntryIds,
    ...(selectedEntryId ? { selectedEntryId } : {}),
    selectedIndex,
    ...window,
    total: index.orderedEntries.length
  };
  projectionCache.set(index, { model, ...(selectedEntryId ? { selectedEntryId } : {}), size });
  return model;
}

export function createRecordingActionPreviewModel(
  entries: readonly unknown[],
  selectedEntryId?: string,
  size = recordingActionPreviewWindowSize
): RecordingActionPreviewModel {
  return projectRecordingActionPreview(createRecordingActionPreviewIndex(entries), selectedEntryId, size);
}

export function recordingActionPreviewWindow(length: number, selectedIndex: number, size: number) {
  const safeSize = Math.max(1, Math.trunc(size));
  const center = selectedIndex < 0 ? 0 : selectedIndex;
  const start = Math.min(Math.max(0, length - safeSize), Math.max(0, center - Math.floor(safeSize / 2)));
  return { start, end: Math.min(length, start + safeSize) };
}

export function recordingActionPreviewTargetIndex(key: string, selectedIndex: number, length: number): number | null {
  if (!length) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowLeft") return Math.max(0, selectedIndex < 0 ? 0 : selectedIndex - 1);
  if (key === "ArrowRight") return Math.min(length - 1, selectedIndex < 0 ? 0 : selectedIndex + 1);
  return null;
}

function isRecordingActionPreviewEntry(value: unknown): value is RecordingActionPreviewEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && (entry.type === "action" || entry.type === "domain_event");
}

function comparePreviewEntries(left: RecordingActionPreviewEntry, right: RecordingActionPreviewEntry): number {
  return (left.sequence ?? 0) - (right.sequence ?? 0)
    || (left.monotonicOffsetMs ?? 0) - (right.monotonicOffsetMs ?? 0)
    || left.id.localeCompare(right.id);
}
