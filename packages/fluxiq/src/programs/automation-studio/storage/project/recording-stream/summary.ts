import type { RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabaseLease } from "../database.ts";
import { automationStudioRecordingEntry as entryCodec } from "./entry.ts";

/** Header publication reads current durable identities at the SQL write boundary. */
export class AutomationStudioRecordingStreamSummary {
  constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  async publish(recording: RecordingSession, proof?: { generation: string; indexed_cursor: number }): Promise<void> {
    const values = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";
    const source = proof ? `select ${values} where exists (select 1 from recording_stream_heads where recording_id = ? and generation = ? and indexed_cursor = ?
      and indexed_cursor = coalesce((select max(last_sequence) from recording_event_chunks where recording_id = ?), 0))` : `values (${values})`;
    const result = await this.lease.database.run(
      `insert into recordings (recording_id, name, task_id, domain_id, status, started_at_ms, ended_at_ms, event_count, action_count, state_snapshot_count, updated_at_ms, description)
       ${source}
       on conflict(recording_id) do update set name = excluded.name, task_id = excluded.task_id, domain_id = excluded.domain_id,
         status = excluded.status, ended_at_ms = excluded.ended_at_ms, event_count = excluded.event_count,
         action_count = excluded.action_count, state_snapshot_count = excluded.state_snapshot_count, updated_at_ms = excluded.updated_at_ms, description = excluded.description`,
      [recording.recordingId, String(recording.metadata?.name ?? recording.recordingId), recording.taskId ?? null, typeof recording.metadata?.domainId === "string" ? recording.metadata.domainId : null,
        recording.endedAt !== undefined ? "completed" : "recording", recording.startedAt, recording.endedAt ?? null, recording.timeline.length,
        recording.timeline.filter(entryCodec.actionLike).length, recording.timeline.filter(entryCodec.stateLike).length,
        Math.max(recording.endedAt ?? 0, recording.timeline.at(-1)?.timestamp ?? 0, recording.startedAt),
        recording.description ?? null,
        ...(proof ? [recording.recordingId, proof.generation, proof.indexed_cursor, recording.recordingId] : [])]
    );
    if (!result.changes) throw new Error("Recording completion changed during publication.");
  }

  async publishCounts(recordingId: string): Promise<void> {
    await this.lease.database.run(`update recordings set event_count = (select event_count from recording_stream_heads where recording_id = ?),
      action_count = (select action_count from recording_stream_heads where recording_id = ?),
      state_snapshot_count = (select state_snapshot_count from recording_stream_heads where recording_id = ?), updated_at_ms = ?
      where recording_id = ? and exists (select 1 from recording_stream_heads where recording_id = ? and indexed_cursor =
        coalesce((select max(last_sequence) from recording_event_chunks where recording_id = ?), 0))`,
      [recordingId, recordingId, recordingId, Date.now(), recordingId, recordingId, recordingId]);
  }

  async removedProofs(recordingId: string): Promise<{ id: string; bodyDigest: string }[]> {
    const rows = await this.lease.database.all<{ entry_id: string; body_digest: string }>("select entry_id, body_digest from recording_stream_tombstones where recording_id = ?", [recordingId]);
    return rows.map(row => ({ id: row.entry_id, bodyDigest: row.body_digest }));
  }
}
