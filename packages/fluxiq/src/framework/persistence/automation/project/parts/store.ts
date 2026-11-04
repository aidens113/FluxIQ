// The project's parts library: what writes and reads it, and nothing that decides
// what a part is (`runtime/project-parts` derives the card and its trust).
//
// **One write is one transaction.** A version's row, its part's row, its facets,
// its full-text row, the calls it makes and the reference that keeps its snapshot
// alive commit together or not at all. The snapshot's bytes go to the content
// store first, unowned, so a write that fails leaves an unreferenced object the
// store's own sweep removes, and no row of any table.
//
// **Versions are immutable.** The table refuses an update or a delete (its
// triggers), so a repair writes the next version and a reader who pinned one
// always finds it as it was.
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { decodePartCursor, encodePartCursor } from "./cursor.ts";
import { partQuerySql } from "./query.ts";
import { callFromRow, partFromRow, runFromRow, versionFromRow, type PartCallRow, type PartRow, type PartRunRow, type PartVersionRow } from "./rows.ts";
import type {
  AutomationStudioProjectPartCall,
  AutomationStudioProjectPartMatch,
  AutomationStudioProjectPartPage,
  AutomationStudioProjectPartQuery,
  AutomationStudioProjectPartRecord,
  AutomationStudioProjectPartRunRecord,
  AutomationStudioProjectPartVersionRecord,
  AutomationStudioProjectPartWrite,
  AutomationStudioProjectPartWriteResult
} from "./types.ts";

const DEFAULT_PAGE = 25;
const MAX_PAGE = 100;
const REFERENCE_OWNER_KIND = "project_part_version";

export class AutomationStudioProjectPartStore {
  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly pool: AutomationStudioProjectDatabasePool,
    private readonly projectId: string
  ) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectPartStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectPartStore(lease, input.pool, input.projectId);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  /** Writes one version in one transaction, or finds the version with the same shape and writes nothing. */
  async writeVersion(input: AutomationStudioProjectPartWrite): Promise<AutomationStudioProjectPartWriteResult> {
    const partId = requiredId(input.partId, "part");
    const known = await this.findByShapeHash(input.shapeHash, partId);
    if (known) return { status: "existing", part: await this.requirePart(known.partId), version: known };
    const now = Math.trunc(input.now ?? Date.now());
    const snapshot = await this.putSnapshot(input.snapshot, partId, now);
    return this.lease.database.transaction(async (sql) => {
      const raced = await sql.get<PartVersionRow>("select * from project_part_versions where shape_hash = ? order by part_id = ? desc, part_id, version limit 1", [input.shapeHash, partId]);
      if (raced) {
        const part = await sql.get<PartRow>("select * from project_parts where part_id = ?", [raced.part_id]);
        if (!part) throw new Error(`Part ${raced.part_id} has a version and no row.`);
        return { status: "existing" as const, part: partFromRow(part), version: versionFromRow(raced) };
      }
      const current = await sql.get<PartRow>("select * from project_parts where part_id = ?", [partId]);
      const version = (current?.latest_version ?? 0) + 1;
      const card = { ...input.card, partId, version };
      await sql.run(
        `insert into project_part_versions (part_id, version, card_json, shape_hash, snapshot_object_id, source_graph_flow_id, source_graph_revision, created_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [partId, version, JSON.stringify(card), input.shapeHash, snapshot.objectId, requiredId(input.sourceGraphFlowId, "graph flow"), input.sourceGraphRevision ?? null, now]
      );
      if (current) await sql.run("update project_parts set latest_version = ?, updated_at_ms = ? where part_id = ?", [version, now, partId]);
      else await sql.run("insert into project_parts (part_id, latest_version, source_flow_id, source_subflow_id, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?)", [partId, version, requiredId(input.sourceFlowId, "flow"), requiredId(input.sourceSubflowId, "subflow"), now, now]);
      for (const facet of ["site", "input", "output", "lasting"] as const) {
        for (const value of new Set(input.facets[facet])) await sql.run("insert into project_part_facets (part_id, version, facet, value) values (?, ?, ?, ?)", [partId, version, facet, value]);
      }
      await sql.run("delete from project_parts_fts where part_id = ?", [partId]);
      await sql.run("insert into project_parts_fts (part_id, version, name, purpose, ports) values (?, ?, ?, ?, ?)", [partId, version, input.searchable.name, input.searchable.purpose, input.searchable.ports.join(" ")]);
      for (const call of input.calls) {
        await sql.run("insert into part_calls (caller_kind, caller_id, caller_version, caller_node_id, part_id, version) values ('part_version', ?, ?, ?, ?, ?)", [partId, version, call.nodeId, call.partId, call.version]);
      }
      await sql.run(
        "insert into object_references (reference_id, object_id, owner_kind, owner_id, purpose, created_at_ms) values (?, ?, ?, ?, 'snapshot', ?)",
        [`reference:${REFERENCE_OWNER_KIND}:${partId}:${version}`, snapshot.objectId, REFERENCE_OWNER_KIND, `${partId}@${version}`, now]
      );
      const written = await sql.get<PartRow>("select * from project_parts where part_id = ?", [partId]);
      const row = await sql.get<PartVersionRow>("select * from project_part_versions where part_id = ? and version = ?", [partId, version]);
      if (!written || !row) throw new Error(`Part ${partId} version ${version} was not written.`);
      return { status: current ? "new_version" as const : "created" as const, part: partFromRow(written), version: versionFromRow(row) };
    });
  }

  async getPart(partId: string): Promise<AutomationStudioProjectPartRecord | undefined> {
    const row = await this.lease.database.get<PartRow>("select * from project_parts where part_id = ?", [requiredId(partId, "part")]);
    return row ? partFromRow(row) : undefined;
  }

  async getVersion(partId: string, version: number): Promise<AutomationStudioProjectPartVersionRecord | undefined> {
    const row = await this.lease.database.get<PartVersionRow>("select * from project_part_versions where part_id = ? and version = ?", [requiredId(partId, "part"), Math.trunc(version)]);
    return row ? versionFromRow(row) : undefined;
  }

  /** Every version of a part, newest first. */
  async listVersions(partId: string): Promise<AutomationStudioProjectPartVersionRecord[]> {
    const rows = await this.lease.database.all<PartVersionRow>("select * from project_part_versions where part_id = ? order by version desc", [requiredId(partId, "part")]);
    return rows.map(versionFromRow);
  }

  /** The version with this shape in this project, preferring `preferPartId`'s own. */
  async findByShapeHash(shapeHash: string, preferPartId?: string): Promise<AutomationStudioProjectPartVersionRecord | undefined> {
    const row = await this.lease.database.get<PartVersionRow>(
      "select * from project_part_versions where shape_hash = ? order by part_id = ? desc, part_id, version limit 1",
      [shapeHash, preferPartId ?? ""]
    );
    return row ? versionFromRow(row) : undefined;
  }

  /** Parts by exact filters and full-text words, each with its newest version. */
  async query(query: AutomationStudioProjectPartQuery = {}): Promise<AutomationStudioProjectPartPage> {
    const pageSize = Math.max(1, Math.min(MAX_PAGE, Math.trunc(query.limit ?? DEFAULT_PAGE)));
    const offset = decodePartCursor(query.cursor);
    const built = partQuerySql(query, offset, pageSize);
    if (!built) return { items: [], nextCursor: null, hasMore: false };
    const ids = await this.lease.database.all<{ part_id: string }>(built.sql, built.params);
    const items: AutomationStudioProjectPartMatch[] = [];
    for (const { part_id: partId } of ids.slice(0, pageSize)) {
      const part = await this.requirePart(partId);
      const version = await this.getVersion(partId, part.latestVersion);
      if (!version) throw new Error(`Part ${partId} has no version ${part.latestVersion}.`);
      items.push({ part, version });
    }
    const hasMore = ids.length > pageSize;
    return { items, hasMore, nextCursor: hasMore ? encodePartCursor(offset + pageSize) : null };
  }

  /** The snapshot a version holds: its graph and its start and end checks. */
  async readSnapshot(partId: string, version: number): Promise<unknown> {
    const record = await this.getVersion(partId, version);
    if (!record) throw new Error(`Unknown part version: ${partId}@${version}`);
    const content = await AutomationStudioProjectContentStore.open({ pool: this.pool, projectId: this.projectId });
    try {
      const asset = await content.readBytesByObjectId(record.snapshotObjectId);
      return JSON.parse(asset.content.toString("utf8")) as unknown;
    } finally {
      await content.close();
    }
  }

  /** Records that a Flow's graph calls a version at a node. A later record for the node replaces the earlier. */
  async recordFlowGraphCall(input: { flowId: string; nodeId: string; partId: string; version: number }): Promise<void> {
    await this.lease.database.run(
      "insert or replace into part_calls (caller_kind, caller_id, caller_version, caller_node_id, part_id, version) values ('flow_graph', ?, 0, ?, ?, ?)",
      [requiredId(input.flowId, "flow"), input.nodeId, requiredId(input.partId, "part"), Math.trunc(input.version)]
    );
  }

  /** Every call to one version, or to any version of a part when none is named. */
  async listCallsTo(input: { partId: string; version?: number }): Promise<AutomationStudioProjectPartCall[]> {
    const rows = await this.lease.database.all<PartCallRow>(
      `select * from part_calls where part_id = ?${input.version === undefined ? "" : " and version = ?"} order by caller_kind, caller_id, caller_version, caller_node_id`,
      input.version === undefined ? [input.partId] : [input.partId, Math.trunc(input.version)]
    );
    return rows.map(callFromRow);
  }

  /** Every call one version of a part makes, by the node that makes each. */
  async listCallsFrom(input: { partId: string; version: number }): Promise<AutomationStudioProjectPartCall[]> {
    const rows = await this.lease.database.all<PartCallRow>(
      "select * from part_calls where caller_kind = 'part_version' and caller_id = ? and caller_version = ? order by caller_node_id",
      [requiredId(input.partId, "part"), Math.trunc(input.version)]
    );
    return rows.map(callFromRow);
  }

  /** What a run of a version came to. The runner writes it; a run id is recorded once per version. */
  async recordRun(run: AutomationStudioProjectPartRunRecord): Promise<void> {
    await this.lease.database.run(
      "insert or replace into project_part_runs (part_id, version, run_id, outcome, model_calls, finished_at_ms) values (?, ?, ?, ?, ?, ?)",
      [requiredId(run.partId, "part"), Math.trunc(run.version), requiredId(run.runId, "run"), run.outcome, Math.max(0, Math.trunc(run.modelCalls)), Math.trunc(run.finishedAtMs)]
    );
  }

  async listRuns(input: { partId: string; version: number; limit?: number }): Promise<AutomationStudioProjectPartRunRecord[]> {
    const rows = await this.lease.database.all<PartRunRow>(
      "select * from project_part_runs where part_id = ? and version = ? order by finished_at_ms, run_id limit ?",
      [requiredId(input.partId, "part"), Math.trunc(input.version), Math.max(1, Math.min(1_000, Math.trunc(input.limit ?? 500)))]
    );
    return rows.map(runFromRow);
  }

  private async requirePart(partId: string): Promise<AutomationStudioProjectPartRecord> {
    const part = await this.getPart(partId);
    if (!part) throw new Error(`Unknown part: ${partId}`);
    return part;
  }

  private async putSnapshot(snapshot: unknown, partId: string, now: number): Promise<{ objectId: string }> {
    const content = await AutomationStudioProjectContentStore.open({ pool: this.pool, projectId: this.projectId });
    try {
      const written = await content.putJson({ value: snapshot, transactionId: `project-part-${partId}-${now}`, createdAt: now });
      return { objectId: written.object.objectId };
    } finally {
      await content.close();
    }
  }
}

function requiredId(value: string, kind: string): string {
  const id = value.trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) throw new Error(`Invalid ${kind} ID.`);
  return id;
}
