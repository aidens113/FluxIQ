import type { RecordingSession } from "../../../model/index.ts";
import { removeRecordingEntriesByEventId } from "./entry-removal.ts";

// The `remove-recording-entry` command as the service runs it: under the
// recording's mutation lock, read the recording, drop every entry recorded from
// gateway event `eventId` (`entry-removal.ts`), and persist the result only when
// something was removed. The service hands its own lock, reader and writer in as
// ports and exposes this collaborator as `recordingEntryRemoval`, so the
// service's facade gains no method and this logic is testable alone.

export type RecordingEntryRemovalPorts = {
  readonly lock: <T>(projectId: string, recordingId: string, run: () => Promise<T>) => Promise<T>;
  readonly read: (projectId: string, recordingId: string) => Promise<RecordingSession>;
  /** Persists the recording the way a domain event is, then rewrites its timeline file in full. */
  readonly save: (projectId: string, recording: RecordingSession) => Promise<void>;
};

export type RecordingEntryRemovalInput = { projectId: string; recordingId: string; eventId: string };

export class AutomationStudioRecordingEntryRemoval {
  constructor(private readonly ports: RecordingEntryRemovalPorts) {}

  async remove(input: RecordingEntryRemovalInput): Promise<{ removedCount: number; recording: RecordingSession }> {
    return await this.ports.lock(input.projectId, input.recordingId, async () => {
      const removal = removeRecordingEntriesByEventId(await this.ports.read(input.projectId, input.recordingId), input.eventId);
      if (removal.removedCount) await this.ports.save(input.projectId, removal.recording);
      return removal;
    });
  }
}
