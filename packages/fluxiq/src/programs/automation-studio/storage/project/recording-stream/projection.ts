import type { AutomationStudioProjectDatabaseLease, AutomationStudioSqlExecutor } from "../database.ts";
import type { AutomationStudioChunkEvent, AutomationStudioProjectEventChunkStore } from "../event-chunk-store.ts";
import { automationStudioRecordingEntry as entryCodec } from "./entry.ts";

type Head = { generation: string; indexed_cursor: number; event_count: number; action_count: number; state_snapshot_count: number };
type Entry = { entry_id: string; public_sequence: number; body_digest: string; timestamp_json: string | null; offset_json: string | null; action_like: number; state_like: number; removed: number; incarnation_cursor: number; packet_key: string | null; capture_digest: string | null };

/** Derived SQL identities advance only after verified chunks; no process cache is authoritative. */
export class AutomationStudioRecordingStreamProjection {
  constructor(private readonly chunks: AutomationStudioProjectEventChunkStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  async synchronize(recordingId: string): Promise<Head> {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.lease.database.run("insert into recording_stream_heads (recording_id) values (?) on conflict(recording_id) do nothing", [recordingId]);
      const head = await this.lease.database.get<Head>("select * from recording_stream_heads where recording_id = ?", [recordingId]);
      if (!head) continue;
      const row = await this.lease.database.get<{ cursor: number | null }>("select max(last_sequence) as cursor from recording_event_chunks where recording_id = ?", [recordingId]);
      const target = row?.cursor ?? 0;
      if (head.indexed_cursor > target) {
        await this.lease.database.run("delete from recording_stream_heads where recording_id = ? and generation = ?", [recordingId, head.generation]);
        continue;
      }
      if (head.indexed_cursor === target) return head;
      const events: AutomationStudioChunkEvent[] = [];
      let cursor = head.indexed_cursor;
      while (cursor < target) {
        const page = await this.chunks.readEventsBySequence({ streamKind: "recording", streamId: recordingId, afterSequence: cursor, limit: 500 });
        const selected = page.events.filter(event => event.sequence <= target);
        const next = selected.at(-1)?.sequence;
        if (next === undefined || next <= cursor) throw new Error("Recording projection chunk history is incomplete.");
        events.push(...selected);
        cursor = next;
      }
      const applied = await this.lease.database.transaction(async sql => {
        const current = await sql.get<Head>("select * from recording_stream_heads where recording_id = ?", [recordingId]);
        if (!current || current.generation !== head.generation || current.indexed_cursor !== head.indexed_cursor) return false;
        const counts = { ...head };
        for (const event of events) await this.apply(sql, recordingId, event, counts);
        await sql.run("update recording_stream_heads set indexed_cursor = ?, event_count = ?, action_count = ?, state_snapshot_count = ? where recording_id = ? and generation = ?", [cursor, counts.event_count, counts.action_count, counts.state_snapshot_count, recordingId, head.generation]);
        return counts;
      });
      if (applied) return { ...applied, indexed_cursor: cursor };
    }
    throw new Error("Recording projection changed during reconciliation.");
  }

  async original(recordingId: string, entry: AutomationStudioChunkEvent): Promise<Entry | undefined> {
    const original = await this.lease.database.get<Entry>("select * from recording_stream_entries where recording_id = ? and entry_id = ?", [recordingId, entry.id]);
    if (original) return original;
    const occupied = await this.lease.database.get<Entry>("select * from recording_stream_entries where recording_id = ? and public_sequence = ?", [recordingId, entry.sequence]);
    if (occupied) throw new Error("Recording public sequence conflict.");
    return await this.lease.database.get<Entry>("select *, 1 as removed from recording_stream_tombstones where recording_id = ? and entry_id = ? order by incarnation_cursor desc limit 1", [recordingId, entry.id]);
  }

  async permitsNewIncarnation(recordingId: string, entry: AutomationStudioChunkEvent): Promise<boolean> {
    if (await this.sameRemovedInput(this.lease.database, recordingId, entry)) return false;
    const key = entryCodec.packetKey(entry);
    return key === null || !await this.removedPacket(this.lease.database, recordingId, key);
  }

  private async sameRemovedInput(sql: AutomationStudioSqlExecutor, recordingId: string, entry: AutomationStudioChunkEvent): Promise<boolean> {
    return Boolean(await sql.get("select 1 from recording_stream_tombstones where recording_id = ? and entry_id = ? and (capture_digest = ? or capture_digest is null) limit 1", [recordingId, entry.id, entryCodec.captureDigest(entry)]));
  }

  private async removedPacket(sql: AutomationStudioSqlExecutor, recordingId: string, key: string): Promise<boolean> {
    const [source, event, correlation] = JSON.parse(key) as [unknown, string | null, string | null];
    if (event !== null && await sql.get("select 1 from recording_stream_tombstones where recording_id = ? and json_extract(packet_key, '$[0]') is ? and json_extract(packet_key, '$[1]') = ? limit 1", [recordingId, source, event])) return true;
    return correlation !== null && Boolean(await sql.get("select 1 from recording_stream_tombstones where recording_id = ? and json_extract(packet_key, '$[0]') is ? and json_extract(packet_key, '$[2]') = ? limit 1", [recordingId, source, correlation]));
  }

  private async apply(sql: AutomationStudioSqlExecutor, recordingId: string, event: AutomationStudioChunkEvent, head: Head): Promise<void> {
    const entry = entryCodec.decode(event);
    if (!entry) {
      for (const proof of entryCodec.removalProofs(event)) {
        const id = proof.id;
        const original = await sql.get<Entry>("select * from recording_stream_entries where recording_id = ? and entry_id = ?", [recordingId, id]);
        if (!original || original.removed) throw new Error("Invalid duplicate or unknown recording removal.");
        if (proof.bodyDigest !== undefined && (proof.bodyDigest !== original.body_digest || proof.publicSequence !== original.public_sequence || proof.incarnationCursor !== original.incarnation_cursor)) throw new Error("Stale recording removal incarnation proof.");
        await sql.run(`insert into recording_stream_tombstones (recording_id, entry_id, public_sequence, body_digest, timestamp_json, offset_json, incarnation_cursor, packet_key, capture_digest)
          select recording_id, entry_id, public_sequence, body_digest, timestamp_json, offset_json, incarnation_cursor, packet_key, capture_digest from recording_stream_entries where recording_id = ? and entry_id = ?`, [recordingId, id]);
        await sql.run("delete from recording_stream_entries where recording_id = ? and entry_id = ?", [recordingId, id]);
        head.event_count--;
        head.action_count -= original.action_like;
        head.state_snapshot_count -= original.state_like;
      }
      return;
    }
    if (typeof entry.id !== "string" || !entry.id || !Number.isSafeInteger(entry.sequence) || entry.sequence < 0) throw new Error("Invalid recording entry identity or public sequence.");
    const digest = entryCodec.digest(entry);
    const existing = await sql.get<Entry>("select * from recording_stream_entries where recording_id = ? and entry_id = ?", [recordingId, entry.id]);
    if (existing) {
      if (existing.removed || existing.body_digest !== digest || existing.public_sequence !== entry.sequence) throw new Error("Recording entry identity/content conflict.");
      return;
    }
    const occupied = await sql.get<Entry>("select * from recording_stream_entries where recording_id = ? and public_sequence = ?", [recordingId, entry.sequence]);
    if (occupied) throw new Error("Recording public sequence conflict.");
    const archived = await sql.get("select 1 from recording_stream_tombstones where recording_id = ? and entry_id = ? limit 1", [recordingId, entry.id]);
    const packet = entryCodec.packetKey(entry);
    if (archived && (await this.sameRemovedInput(sql, recordingId, entry) || (packet !== null && await this.removedPacket(sql, recordingId, packet)))) throw new Error("Recording entry conflicts with explicit removal.");
    const action = Number(entryCodec.actionLike(entry));
    const state = Number(entryCodec.stateLike(entry));
    await sql.run("insert into recording_stream_entries (recording_id, entry_id, public_sequence, body_digest, timestamp_json, offset_json, action_like, state_like, incarnation_cursor, packet_key, capture_digest) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [recordingId, entry.id, entry.sequence, digest, JSON.stringify(entry.timestamp) ?? null, JSON.stringify(entry.monotonicOffsetMs) ?? null, action, state, event.sequence, packet, entryCodec.captureDigest(entry)]);
    head.event_count++;
    head.action_count += action;
    head.state_snapshot_count += state;
  }
}
