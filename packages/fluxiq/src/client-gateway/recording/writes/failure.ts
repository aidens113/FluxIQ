import type { RecordingWriteTarget } from "./target.ts";

/** Private failure observation; payloads never enter this diagnostic contract. */
export interface RecordingWriteFailure {
  readonly ownerKey: string;
  readonly recording: RecordingWriteTarget | undefined;
  readonly entryCount: number;
  readonly cause: unknown;
}
