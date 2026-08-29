export const recordingDirectoryWindowSize = 100;
export const recordingTrackWindowSize = 200;

export type RecordingTrack = {
  type: string;
  entries: any[];
  total: number;
};

export function recordingDirectoryWindow(recordings: any[], selectedRecordingId?: string, size = recordingDirectoryWindowSize): any[] {
  const limit = Math.max(1, Math.trunc(size));
  const window = recordings.slice(0, limit);
  if (!selectedRecordingId || window.some((recording) => recording.recordingId === selectedRecordingId)) return window;
  const selected = recordings.find((recording) => recording.recordingId === selectedRecordingId);
  return selected ? [...window.slice(0, Math.max(0, limit - 1)), selected] : window;
}

export function recordingTimelineTracks(entries: any[], types: readonly string[], size = recordingTrackWindowSize): RecordingTrack[] {
  const limit = Math.max(1, Math.trunc(size));
  const tracks = new Map(types.map((type) => [type, { type, entries: [] as any[], total: 0 }]));
  for (const entry of entries) {
    const track = tracks.get(entry?.type);
    if (!track) continue;
    track.total += 1;
    if (track.entries.length < limit) track.entries.push(entry);
  }
  return types.map((type) => tracks.get(type)!);
}

export function recordingTimelineSummary(entries: any[]) {
  let checkpoints = 0;
  let deltas = 0;
  for (const entry of entries) {
    if (entry?.type === "state_checkpoint") checkpoints += 1;
    if (entry?.type === "state_delta") deltas += entry.deltas?.length ?? 0;
  }
  return { entries: entries.length, checkpoints, deltas };
}