import type { AutomationStudioBackgroundJobRepository } from "./project-administration.ts";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import type { AutomationStudioEventStreamKind } from "./project-event-chunk-store.ts";

export type AutomationStudioArchivedChunk = { chunkId: string; objectId: string; lastSequence: number; archivedAt: number; jobId: string };

export class AutomationStudioProjectRetentionStore {
  private constructor(private readonly administration: AutomationStudioProjectAdministration, private readonly content: AutomationStudioProjectContentStore, private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectRetentionStore> {
    const administration = await AutomationStudioProjectAdministration.open(input);
    try {
      const content = await AutomationStudioProjectContentStore.open(input);
      try {
        const lease = await input.pool.acquire(input.projectId);
        return new AutomationStudioProjectRetentionStore(administration, content, lease);
      } catch (error) {
        await content.close();
        throw error;
      }
    } catch (error) {
      await administration.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.lease.release();
    await this.content.close();
    await this.administration.close();
  }

  async archiveChunksBeforeSequence(input: { streamKind: AutomationStudioEventStreamKind; streamId: string; beforeOrAtSequence: number; now?: number; limit?: number }): Promise<AutomationStudioArchivedChunk[]> {
    const now = input.now ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
    const streamId = requiredId(input.streamId, "stream");
    const sequence = Math.max(0, Math.trunc(input.beforeOrAtSequence));
    const rows = input.streamKind === "runtime"
      ? await this.lease.database.all<ChunkRow>("select chunk_id, object_id, last_sequence from runtime_event_chunks where run_id = ? and archived_at_ms is null and last_sequence <= ? order by last_sequence, chunk_id limit ?", [streamId, sequence, limit])
      : await this.lease.database.all<ChunkRow>("select chunk_id, object_id, last_sequence from recording_event_chunks where recording_id = ? and archived_at_ms is null and last_sequence <= ? order by last_sequence, chunk_id limit ?", [streamId, sequence, limit]);
    const archived: AutomationStudioArchivedChunk[] = [];
    for (const row of rows) {
      if (input.streamKind === "runtime") await this.lease.database.run("update runtime_event_chunks set archived_at_ms = ? where chunk_id = ? and archived_at_ms is null", [now, row.chunk_id]);
      else await this.lease.database.run("update recording_event_chunks set archived_at_ms = ? where chunk_id = ? and archived_at_ms is null", [now, row.chunk_id]);
      const jobId = `job:archive:${input.streamKind}:${streamId}:${row.last_sequence}`;
      await this.jobs.enqueue({ jobId, kind: "archive_event_chunk", ownerKind: input.streamKind === "runtime" ? "runtime_run" : "recording", ownerId: streamId, priority: -10, inputObjectId: row.object_id, outputObjectId: null, availableAt: now, createdAt: now, updatedAt: now }).catch((error) => {
        if (!String(error).includes("SQLITE_CONSTRAINT")) throw error;
      });
      archived.push({ chunkId: row.chunk_id, objectId: row.object_id, lastSequence: row.last_sequence, archivedAt: now, jobId });
    }
    return archived;
  }

  sweepUnreferencedObjects(input: { limit?: number } = {}): Promise<{ deleted: string[] }> {
    return this.content.sweepUnreferencedObjects(input);
  }

  private get jobs(): AutomationStudioBackgroundJobRepository {
    return this.administration.backgroundJobs;
  }
}

type ChunkRow = { chunk_id: string; object_id: string; last_sequence: number };

function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }

