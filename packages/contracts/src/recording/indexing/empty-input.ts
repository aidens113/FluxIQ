export type EmptyRecordingIndexInput = {
  projectId: string;
  recordingId: string;
  name?: string;
  startedAt?: number;
  endedAt?: number;
  updatedAt?: number;
  timelineRef?: string;
};
