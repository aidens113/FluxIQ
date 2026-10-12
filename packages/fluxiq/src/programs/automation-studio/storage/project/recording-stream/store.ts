import { isDeepStrictEqual } from "node:util";
import type { RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabaseLease } from "../database.ts";
import type { AutomationStudioChunkEvent, AutomationStudioProjectEventChunkStore } from "../event-chunk-store.ts";

import { automationStudioRecordingEntry as entryCodec } from "./entry.ts";
import { AutomationStudioRecordingStreamProjection } from "./projection.ts";
import { AutomationStudioRecordingReconciliation } from "./reconciliation.ts";

/** Storage cursors identify chunk positions; public entry sequences remain untouched. */
export class AutomationStudioRecordingStreamStore {
  constructor(private readonly chunks: AutomationStudioProjectEventChunkStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  async lastSequence(recordingId: string): Promise<number> {
    const row = await this.lease.database.get<{ last_sequence: number | null }>("select max(last_sequence) as last_sequence from recording_event_chunks where recording_id = ?", [recordingId]);
    return row?.last_sequence ?? 0;
  }

  async append(recordingId: string, entries: AutomationStudioChunkEvent[], maxEvents = 2_000, generatedFields: { id: string; timestamp: boolean; monotonicOffset: boolean }[] = []): Promise<{ nextCursor: string | null; lastSequence: number; counts: { events: number; actions: number; states: number }; entries: AutomationStudioChunkEvent[] }> {
    const status = await this.lease.database.get<{ ended_at_ms: number | null }>("select ended_at_ms from recordings where recording_id = ?", [recordingId]);
    if (status?.ended_at_ms != null) throw new Error("Finalized recordings are immutable.");
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Duplicate recording entries in one append.");
    AutomationStudioRecordingStreamStore.merge(entries);
    const projection = new AutomationStudioRecordingStreamProjection(this.chunks, this.lease);
    const before = await projection.synchronize(recordingId);
    const proof = new Map(generatedFields.map(fields => [fields.id, fields]));
    const accepted: AutomationStudioChunkEvent[] = [];
    const pending: AutomationStudioChunkEvent[] = [];
    for (const entry of entries) {
      const original = await projection.original(recordingId, entry);
      if (!original) {
        accepted.push(entry);
        pending.push(entry);
        continue;
      }
      if (original.removed) {
        if (!await projection.permitsNewIncarnation(recordingId, entry)) throw new Error("Recording entry conflicts with explicit removal.");
        accepted.push(entry);
        pending.push(entry);
        continue;
      }
      const omitted = proof.get(String(entry.id));
      const retry = {
        ...entry,
        ...(omitted?.timestamp ? { timestamp: original.timestamp_json === null ? undefined : JSON.parse(original.timestamp_json) } : {}),
        ...(omitted?.monotonicOffset ? { monotonicOffsetMs: original.offset_json === null ? undefined : JSON.parse(original.offset_json) } : {})
      };
      if (entryCodec.digest(retry) !== original.body_digest) throw new Error("Recording entry identity/content conflict.");
      accepted.push(retry);
    }
    await this.writeEntries(recordingId, pending, maxEvents);
    const head = await projection.synchronize(recordingId);
    if (head.generation !== before.generation) throw new Error("Recording projection generation changed during append.");
    for (const entry of accepted) {
      const landed = await projection.original(recordingId, entry);
      if (!landed || landed.removed || landed.body_digest !== entryCodec.digest(entry)) throw new Error("Recording append was removed or conflicted during persistence.");
    }
    return { nextCursor: head.indexed_cursor ? String(head.indexed_cursor) : null, lastSequence: head.indexed_cursor, counts: { events: head.event_count, actions: head.action_count, states: head.state_snapshot_count }, entries: accepted };
  }
  private async writeEntries(recordingId: string, entries: AutomationStudioChunkEvent[], maxEvents = 2_000): Promise<{ nextCursor: string | null; lastSequence: number }> {
    const after = await this.lastSequence(recordingId);
    if (!entries.length) return { nextCursor: null, lastSequence: after };
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new Error("Invalid recording chunk event limit.");
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Duplicate recording entries.");
    AutomationStudioRecordingStreamStore.merge(entries);
    for (let offset = 0; offset < entries.length; offset += maxEvents) {
      const events = entries.slice(offset, offset + maxEvents).map((entry, index) => entryCodec.encode(entry, after + offset + index + 1));
      await this.chunks.writeChunk({ streamKind: "recording", streamId: recordingId, events, maxEvents });
    }
    return { nextCursor: String(after + entries.length), lastSequence: after + entries.length };
  }

  async readTimeline(recordingId: string, legacy: AutomationStudioChunkEvent[] = []): Promise<AutomationStudioChunkEvent[]> {
    const { entries, removed } = await this.history(recordingId);
    // Fold removals after merging, so stale JSONL cannot resurrect an explicit deletion.
    return AutomationStudioRecordingStreamStore.merge([...legacy, ...entries].filter(entry => !removed.has(identity(entry))));
  }

  async completionProof(recording: RecordingSession): Promise<{ generation: string; indexed_cursor: number }> {
    const projection = new AutomationStudioRecordingStreamProjection(this.chunks, this.lease);
    const head = await projection.synchronize(recording.recordingId);
    if (head.event_count !== recording.timeline.length) throw new Error("Recording completion conflicts with durable timeline.");
    for (const entry of recording.timeline) {
      const original = await projection.original(recording.recordingId, entry);
      if (!original || original.removed || original.body_digest !== entryCodec.digest(entry)) throw new Error("Recording completion identity/content conflict.");
    }
    return head;
  }

  async reconcile(recording: RecordingSession): Promise<void> {
    const status = await this.lease.database.get<{ ended_at_ms: number | null }>("select ended_at_ms from recordings where recording_id = ?", [recording.recordingId]);
    if (status?.ended_at_ms != null && status.ended_at_ms !== recording.endedAt) throw new Error("Finalized recording end time conflict.");
    const { entries, removed } = await this.history(recording.recordingId);
    if (recording.timeline.some(entry => removed.has(identity(entry)))) throw new Error("Recording timeline conflicts with explicit removal.");
    const existing = AutomationStudioRecordingStreamStore.merge(entries);
    const wanted = AutomationStudioRecordingStreamStore.merge(recording.timeline);
    const wantedIds = new Set(wanted.map(entry => String(entry.id)));
    if (existing.some(entry => !wantedIds.has(String(entry.id)))) throw new Error("Recording timeline is missing durable entries; explicit removal is required.");
    AutomationStudioRecordingStreamStore.merge([...existing, ...wanted]);
    const existingIds = new Set(existing.map(entry => String(entry.id)));
    const missing = wanted.filter(entry => !existingIds.has(String(entry.id)));
    if (status?.ended_at_ms != null && missing.length) {
      await new AutomationStudioRecordingReconciliation(this.chunks, this.lease).write(recording, missing, 2_000);
    } else await this.writeEntries(recording.recordingId, missing);
  }

  async page(recordingId: string, afterSequence: number, limit: number) {
    const raw = await this.chunks.readEventsBySequence({ streamKind: "recording", streamId: recordingId, afterSequence, limit });
    const { entries } = await this.history(recordingId);
    const active = new Set(entries.map(identity));
    const events = raw.events.flatMap(event => {
      const entry = entryCodec.decode(event);
      return entry && active.has(identity(entry)) ? [entry] : [];
    });
    const lastSequence = raw.events.at(-1)?.sequence ?? afterSequence;
    const hasMore = (await this.lastSequence(recordingId)) > lastSequence;
    return { events, nextCursor: hasMore ? String(lastSequence) : null, hasMore, lastSequence };
  }

  async remove(input: { previous: RecordingSession; next: RecordingSession }): Promise<void> {
    if (input.previous.endedAt !== undefined || input.next.endedAt !== undefined) throw new Error("Finalized recordings are immutable.");
    if (input.previous.recordingId !== input.next.recordingId) throw new Error("Recording removal identity conflict.");
    const previous = AutomationStudioRecordingStreamStore.merge(input.previous.timeline);
    const next = AutomationStudioRecordingStreamStore.merge(input.next.timeline);
    const { entries, cursors } = await this.history(input.previous.recordingId);
    const durable = AutomationStudioRecordingStreamStore.merge(entries);
    if (!equal(durable, previous)) throw new Error("Stale recording removal conflicts with durable entries.");
    const previousById = new Map(previous.map(entry => [String(entry.id), entry]));
    for (const entry of next) if (!equal(previousById.get(String(entry.id)), entry)) throw new Error("Recording removal content conflict.");
    const nextIds = new Set(next.map(entry => String(entry.id)));
    const removedIds = previous.filter(entry => !nextIds.has(String(entry.id))).map(entry => String(entry.id));
    if (!removedIds.length) throw new Error("Recording removal requires existing entries.");
    const recordingId = input.previous.recordingId;
    const status = await this.lease.database.get<{ ended_at_ms: number | null }>("select ended_at_ms from recordings where recording_id = ?", [recordingId]);
    if (status?.ended_at_ms !== null && status?.ended_at_ms !== undefined) throw new Error("Finalized recordings are immutable.");
    const proofs = removedIds.map(id => {
      const entry = previousById.get(id)!;
      return { id, publicSequence: entry.sequence, bodyDigest: entryCodec.digest(entry), incarnationCursor: cursors.get(id)! };
    });
    await this.chunks.writeChunk({ streamKind: "recording", streamId: recordingId, events: [entryCodec.removal(proofs, await this.lastSequence(recordingId) + 1)] });
  }

  static merge(entries: AutomationStudioChunkEvent[]): AutomationStudioChunkEvent[] {
    const byId = new Map<string, AutomationStudioChunkEvent>();
    const bySequence = new Map<number, string>();
    for (const entry of entries) {
      if (typeof entry.id !== "string" || !entry.id || !Number.isSafeInteger(entry.sequence) || entry.sequence < 0) throw new Error("Invalid recording entry identity or public sequence.");
      const existing = byId.get(entry.id);
      if (existing && !equal(existing, entry)) throw new Error("Recording entry identity/content conflict.");
      if (bySequence.has(entry.sequence) && bySequence.get(entry.sequence) !== entry.id) throw new Error("Recording public sequence conflict.");
      byId.set(entry.id, entry);
      bySequence.set(entry.sequence, entry.id);
    }
    return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  }

  private async history(recordingId: string) {
    const active = new Map<string, AutomationStudioChunkEvent>();
    const cursors = new Map<string, number>();
    const packets = new Map<string, Set<string | null>>();
    const captures = new Map<string, Set<string>>();
    const removed = new Set<string>();
    const last = await this.lastSequence(recordingId);
    let afterSequence = 0;
    while (afterSequence < last) {
      const page = await this.chunks.readEventsBySequence({ streamKind: "recording", streamId: recordingId, afterSequence, limit: 500 });
      if (!page.events.length) throw new Error("Recording chunk history is incomplete.");
      for (const event of page.events) {
        const entry = entryCodec.decode(event);
        if (entry) {
          const id = String(entry.id);
          const previous = active.get(id);
          if (previous && !equal(previous, entry)) throw new Error("Recording entry identity/content conflict.");
          if (!previous && packets.has(id)) {
            const key = entryCodec.packetKey(entry);
            if (captures.get(id)!.has(entryCodec.captureDigest(entry)) || [...packets.get(id)!].some(old => entryCodec.samePacket(old, key))) throw new Error("Recording entry conflicts with explicit removal.");
          }
          if (!previous) cursors.set(id, event.sequence);
          active.set(id, entry);
        }
        else {
          for (const proof of entryCodec.removalProofs(event)) {
            const entry = active.get(proof.id);
            if (!entry) throw new Error("Invalid duplicate or unknown recording removal.");
            if (proof.bodyDigest !== undefined && (proof.bodyDigest !== entryCodec.digest(entry) || proof.publicSequence !== entry.sequence || proof.incarnationCursor !== cursors.get(proof.id))) throw new Error("Stale recording removal incarnation proof.");
            removed.add(identity(entry));
            const archived = packets.get(proof.id) ?? new Set<string | null>();
            archived.add(entryCodec.packetKey(entry));
            packets.set(proof.id, archived);
            const bodies = captures.get(proof.id) ?? new Set<string>();
            bodies.add(entryCodec.captureDigest(entry));
            captures.set(proof.id, bodies);
            active.delete(proof.id);
            cursors.delete(proof.id);
          }
        }
      }
      const next = page.events.at(-1)!.sequence;
      if (next <= afterSequence) throw new Error("Recording cursor did not advance.");
      afterSequence = next;
    }
    return { entries: [...active.values()], removed, cursors };
  }
}

function equal(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left === undefined ? left : JSON.parse(JSON.stringify(left)), right === undefined ? right : JSON.parse(JSON.stringify(right)));
}

function identity(entry: AutomationStudioChunkEvent): string {
  return `${entry.id}:${entryCodec.digest(entry)}`;
}
