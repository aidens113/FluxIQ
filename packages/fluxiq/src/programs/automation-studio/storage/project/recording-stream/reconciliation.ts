import { createHash, randomUUID } from "node:crypto";
import type { RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabaseLease } from "../database.ts";
import type { AutomationStudioChunkEvent, AutomationStudioProjectEventChunkStore } from "../event-chunk-store.ts";
import { automationStudioRecordingEntry as entryCodec } from "./entry.ts";
import { AutomationStudioRecordingStreamProjection } from "./projection.ts";

/** Only proven finalized legacy reconciliation can authorize an exact missing chunk. */
export class AutomationStudioRecordingReconciliation {
  constructor(private readonly chunks: AutomationStudioProjectEventChunkStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  async write(recording: RecordingSession, entries: AutomationStudioChunkEvent[], maxEvents: number): Promise<{ nextCursor: string | null; lastSequence: number }> {
    const projection = new AutomationStudioRecordingStreamProjection(this.chunks, this.lease);
    let head = await projection.synchronize(recording.recordingId);
    const digest = entryCodec.digest({ sequence: 0, entries: recording.timeline });
    for (let offset = 0; offset < entries.length; offset += maxEvents) {
      const events = entries.slice(offset, offset + maxEvents).map((entry, index) => entryCodec.encode(entry, head.indexed_cursor + index + 1));
      const first = events[0]!.sequence;
      const last = events.at(-1)!.sequence;
      const document = { schemaVersion: "automation-studio.event-chunk.v1", streamKind: "recording", streamId: recording.recordingId, firstSequence: first, lastSequence: last, events };
      const sha = createHash("sha256").update(JSON.stringify(document)).digest("hex");
      const claim = randomUUID();
      try {
        const inserted = await this.lease.database.run(`insert into recording_stream_reconciliations
          (recording_id, claim_id, owner_pid, generation, ended_at_ms, complete_count, complete_digest, first_sequence, last_sequence, chunk_sha256)
          select ?, ?, ?, ?, ?, ?, ?, ?, ?, ? where exists (select 1 from recordings r join recording_stream_heads h using(recording_id)
            where r.recording_id = ? and r.ended_at_ms = ? and r.event_count = ? and h.generation = ? and h.indexed_cursor = ?
            and h.indexed_cursor = coalesce((select max(last_sequence) from recording_event_chunks where recording_id = ?), 0))
          on conflict(recording_id) do nothing`,
          [recording.recordingId, claim, process.pid, head.generation, recording.endedAt!, recording.timeline.length, digest, first, last, sha,
            recording.recordingId, recording.endedAt!, recording.timeline.length, head.generation, head.indexed_cursor, recording.recordingId]);
        if (!inserted.changes && !await this.reclaim(recording, claim, head.generation, digest, first, last, sha)) throw new Error("Finalized recording reconciliation claim conflict.");
        await this.chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events, maxEvents });
      } finally {
        await this.lease.database.run("delete from recording_stream_reconciliations where recording_id = ? and claim_id = ?", [recording.recordingId, claim]);
      }
      head = await projection.synchronize(recording.recordingId);
    }
    return { nextCursor: head.indexed_cursor ? String(head.indexed_cursor) : null, lastSequence: head.indexed_cursor };
  }

  private async reclaim(recording: RecordingSession, claim: string, generation: string, digest: string, first: number, last: number, sha: string): Promise<boolean> {
    const previous = await this.lease.database.get<{ claim_id: string; owner_pid: number }>("select claim_id, owner_pid from recording_stream_reconciliations where recording_id = ?", [recording.recordingId]);
    if (!previous || !Number.isSafeInteger(previous.owner_pid) || previous.owner_pid < 1) return false;
    try {
      process.kill(previous.owner_pid, 0);
      return false;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") return false;
    }
    const replaced = await this.lease.database.run(`update recording_stream_reconciliations set claim_id = ?, owner_pid = ?
      where recording_id = ? and claim_id = ? and owner_pid = ? and generation = ? and ended_at_ms = ? and complete_count = ?
        and complete_digest = ? and first_sequence = ? and last_sequence = ? and chunk_sha256 = ?
        and exists (select 1 from recordings r join recording_stream_heads h using(recording_id) where r.recording_id = ?
          and r.ended_at_ms = ? and r.event_count = ? and h.generation = ? and h.indexed_cursor = ?
          and h.indexed_cursor = coalesce((select max(last_sequence) from recording_event_chunks where recording_id = ?), 0))`,
      [claim, process.pid, recording.recordingId, previous.claim_id, previous.owner_pid, generation, recording.endedAt!, recording.timeline.length,
        digest, first, last, sha, recording.recordingId, recording.endedAt!, recording.timeline.length, generation, first - 1, recording.recordingId]);
    return replaced.changes === 1;
  }
}
