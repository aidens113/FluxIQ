import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectEventChunkStore, type AutomationStudioChunkEvent, type AutomationStudioEventChunkRecord, type AutomationStudioEventStreamKind } from "./project-event-chunk-store.ts";

export type AutomationStudioEventStreamWriter = {
  append(events: AutomationStudioChunkEvent[]): Promise<void>;
  seal(): Promise<AutomationStudioEventChunkRecord | null>;
  close(options?: { releaseLease?: boolean }): Promise<void>;
};

export class AutomationStudioProjectEventStreamStore {
  private constructor(private readonly pool: AutomationStudioProjectDatabasePool, private readonly projectId: string, private readonly chunkStore: AutomationStudioProjectEventChunkStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectEventStreamStore> {
    const chunkStore = await AutomationStudioProjectEventChunkStore.open(input);
    try {
      const lease = await input.pool.acquire(input.projectId);
      return new AutomationStudioProjectEventStreamStore(input.pool, input.projectId, chunkStore, lease);
    } catch (error) {
      await chunkStore.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.lease.release();
    await this.chunkStore.close();
  }

  async acquireWriter(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; ownerId: string; leaseTtlMs?: number; now?: number }): Promise<AutomationStudioEventStreamWriter> {
    const now = input.now ?? Date.now();
    const ttl = Math.max(1_000, Math.trunc(input.leaseTtlMs ?? 30_000));
    const streamKind = input.streamKind;
    const streamId = requiredId(input.streamId, "stream");
    const leaseToken = randomUUID();
    const spoolId = `spool:${streamKind}:${streamId}:${leaseToken}`;
    const spoolPath = path.join("projects", safeSegment(this.projectId), "spools", streamKind, safeSegment(streamId), `${leaseToken}.jsonl`).replaceAll(path.sep, "/");
    await this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<{ expires_at_ms: number }>("select expires_at_ms from event_writer_leases where stream_kind = ? and stream_id = ?", [streamKind, streamId]);
      if (existing && existing.expires_at_ms > now) throw new Error(`Automation Studio event stream ${streamKind}:${streamId} already has an active writer.`);
      await sql.run(
        `insert into event_writer_leases (stream_kind, stream_id, lease_token, owner_id, acquired_at_ms, heartbeat_at_ms, expires_at_ms)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(stream_kind, stream_id) do update set lease_token = excluded.lease_token, owner_id = excluded.owner_id,
           acquired_at_ms = excluded.acquired_at_ms, heartbeat_at_ms = excluded.heartbeat_at_ms, expires_at_ms = excluded.expires_at_ms`,
        [streamKind, streamId, leaseToken, requiredId(input.ownerId, "writer"), now, now, now + ttl]
      );
      await sql.run(
        `insert into event_spools (spool_id, stream_kind, stream_id, lease_token, spool_path, status, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [spoolId, streamKind, streamId, leaseToken, spoolPath, now, now]
      );
    });
    await mkdir(path.dirname(this.resolvePath(spoolPath)), { recursive: true });
    return new SqlEventStreamWriter({ owner: this, streamKind, streamId, leaseToken, spoolId, spoolPath });
  }

  async recoverExpiredSpools(input: { now?: number; limit?: number } = {}): Promise<AutomationStudioEventChunkRecord[]> {
    const now = input.now ?? Date.now();
    const rows = await this.lease.database.all<SpoolRow>(
      `select event_spools.* from event_spools left join event_writer_leases on event_writer_leases.stream_kind = event_spools.stream_kind and event_writer_leases.stream_id = event_spools.stream_id and event_writer_leases.lease_token = event_spools.lease_token
       where event_spools.status = 'active' and (event_writer_leases.lease_token is null or event_writer_leases.expires_at_ms <= ?) order by event_spools.updated_at_ms, event_spools.spool_id limit ?`,
      [now, Math.max(1, Math.min(100, Math.trunc(input.limit ?? 25)))]
    );
    const recovered: AutomationStudioEventChunkRecord[] = [];
    for (const row of rows) {
      const events = await this.readValidSpoolEvents(row.spool_path);
      if (!events.length) {
        await this.lease.database.run("update event_spools set status = 'abandoned', updated_at_ms = ? where spool_id = ?", [now, row.spool_id]);
        continue;
      }
      const chunk = await this.chunkStore.writeChunk({ streamKind: row.stream_kind, streamId: row.stream_id, events, transactionId: row.lease_token, createdAt: now });
      await this.lease.database.run("update event_spools set status = 'recovered', updated_at_ms = ? where spool_id = ?", [now, row.spool_id]);
      await this.lease.database.run("delete from event_writer_leases where stream_kind = ? and stream_id = ? and lease_token = ?", [row.stream_kind, row.stream_id, row.lease_token]);
      await rm(this.resolvePath(row.spool_path), { force: true });
      recovered.push(chunk);
    }
    return recovered;
  }

  async appendToSpool(input: { spoolId: string; spoolPath: string; leaseToken: string; streamKind: AutomationStudioEventStreamKind; streamId: string; events: AutomationStudioChunkEvent[] }): Promise<void> {
    const existing = await this.lease.database.get<SpoolRow>("select * from event_spools where spool_id = ? and status = 'active'", [input.spoolId]);
    if (!existing) throw new Error(`Automation Studio event spool ${input.spoolId} is not active.`);
    const events = validateAppend(existing, input.events);
    const lines = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
    await appendFile(this.resolvePath(input.spoolPath), lines, "utf8");
    await this.lease.database.run(
      `update event_spools set first_sequence = coalesce(first_sequence, ?), last_sequence = ?, event_count = event_count + ?, byte_count = byte_count + ?, updated_at_ms = ? where spool_id = ?`,
      [events[0]!.sequence, events[events.length - 1]!.sequence, events.length, Buffer.byteLength(lines), Date.now(), input.spoolId]
    );
  }

  async sealSpool(input: { spoolId: string; spoolPath: string; leaseToken: string; streamKind: AutomationStudioEventStreamKind; streamId: string }): Promise<AutomationStudioEventChunkRecord | null> {
    const row = await this.lease.database.get<SpoolRow>("select * from event_spools where spool_id = ? and status = 'active'", [input.spoolId]);
    if (!row) return null;
    const events = await this.readValidSpoolEvents(input.spoolPath);
    const chunk = events.length ? await this.chunkStore.writeChunk({ streamKind: input.streamKind, streamId: input.streamId, events, transactionId: input.leaseToken }) : null;
    await this.lease.database.run("update event_spools set status = 'sealed', updated_at_ms = ? where spool_id = ?", [Date.now(), input.spoolId]);
    await this.lease.database.run("delete from event_writer_leases where stream_kind = ? and stream_id = ? and lease_token = ?", [input.streamKind, input.streamId, input.leaseToken]);
    await rm(this.resolvePath(input.spoolPath), { force: true });
    return chunk;
  }

  async releaseWriter(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; leaseToken: string }): Promise<void> {
    await this.lease.database.run("delete from event_writer_leases where stream_kind = ? and stream_id = ? and lease_token = ?", [input.streamKind, input.streamId, input.leaseToken]);
  }

  private async readValidSpoolEvents(spoolPath: string): Promise<AutomationStudioChunkEvent[]> {
    const text = await readFile(this.resolvePath(spoolPath), "utf8").catch(() => "");
    const events: AutomationStudioChunkEvent[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as AutomationStudioChunkEvent;
        if (!Number.isFinite(parsed.sequence)) break;
        if (events.length && parsed.sequence !== events[events.length - 1]!.sequence + 1) break;
        events.push({ ...parsed, sequence: Math.trunc(parsed.sequence) });
      } catch { break; }
    }
    return events;
  }

  private resolvePath(relativePath: string): string {
    const target = path.resolve(this.pool.rootDir, relativePath);
    const root = `${path.resolve(this.pool.rootDir)}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio event stream path escapes its storage root.");
    return target;
  }
}

class SqlEventStreamWriter implements AutomationStudioEventStreamWriter {
  constructor(private readonly input: { owner: AutomationStudioProjectEventStreamStore; streamKind: AutomationStudioEventStreamKind; streamId: string; leaseToken: string; spoolId: string; spoolPath: string }) {}

  append(events: AutomationStudioChunkEvent[]): Promise<void> {
    return this.input.owner.appendToSpool({ ...this.input, events });
  }

  seal(): Promise<AutomationStudioEventChunkRecord | null> {
    return this.input.owner.sealSpool(this.input);
  }

  async close(options: { releaseLease?: boolean } = {}): Promise<void> {
    if (options.releaseLease === false) return;
    await this.input.owner.releaseWriter(this.input);
  }
}

type SpoolRow = { spool_id: string; stream_kind: AutomationStudioEventStreamKind; stream_id: string; lease_token: string; first_sequence: number | null; last_sequence: number | null; event_count: number; byte_count: number; spool_path: string; status: "active" | "sealed" | "recovered" | "abandoned"; created_at_ms: number; updated_at_ms: number };

function validateAppend(spool: SpoolRow, events: readonly AutomationStudioChunkEvent[]): AutomationStudioChunkEvent[] { if (!events.length) throw new Error("Automation Studio event stream append requires events."); const copied = events.map((event) => ({ ...event, sequence: Math.trunc(event.sequence) })); const expectedFirst = spool.last_sequence === null ? copied[0]!.sequence : spool.last_sequence + 1; for (let index = 0; index < copied.length; index += 1) { const expected = expectedFirst + index; if (copied[index]!.sequence !== expected) throw new Error(`Automation Studio event stream expected sequence ${expected}.`); } return copied; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function safeSegment(value: string): string { return requiredId(value, "path segment"); }
