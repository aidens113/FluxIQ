import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import type { ClientMessageSender } from "./sender.ts";
export type RecordingAppendQueueItem<TTarget, TEvidence> = { projectId?: string | null; recordingId: string; entry: AppendRecordingEntryInput<TTarget, TEvidence>; sender: ClientMessageSender };
