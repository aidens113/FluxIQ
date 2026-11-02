export type PendingClientStart = { recordingId: string; settled: Promise<void>; stopRequested: boolean; projectId?: string | null };
