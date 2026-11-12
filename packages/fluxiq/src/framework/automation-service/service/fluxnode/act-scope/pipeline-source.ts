// An execution's immutable source enumeration. Dataset storage owns rows; task memory owns only its reference.
import { randomUUID } from "node:crypto";
import { dataFieldPathSteps, dataLineageSchema, formatJsonPointer, isJsonObject, type DataPipeline, type DatasetRef } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import { PipelineError, type PipelineDatasetReader, type PipelineRecord } from "../../pipelines/index.ts";
import { fluxNodeWithheldRecords } from "../secrets/index.ts";

type SourceReference = { snapshotId: string; count: number };
type SnapshotRow = { occurrenceId: string; row: JsonObject };

export class FluxNodePipelineSource {
  private reading: Promise<PipelineRecord[]> | undefined;
  private readonly privateRows = new Map<string, Promise<SnapshotRow[] | null>>();

  constructor(private readonly input: {
    projectId: string;
    runId: string;
    source: DataPipeline["source"];
    inputs: JsonObject;
    snapshots: Pick<AutomationStudioRunDatasets, "createImmutableSnapshot" | "readImmutableSnapshotPage">;
    reference: { read: () => Promise<SourceReference | undefined>; write: (reference: SourceReference) => Promise<void> };
    fallbackReadDataset: PipelineDatasetReader;
    secretTexts: readonly string[];
  }) {}

  read(load: () => Promise<PipelineRecord[]>): Promise<PipelineRecord[]> {
    return this.reading ??= this.open(load);
  }

  /** Existing private immutable datasets are rebound by their opaque occurrence IDs, never copied into a new snapshot. */
  async readDataset(dataset: DatasetRef): Promise<JsonObject[]> {
    const rows = await this.rows(dataset.datasetId);
    return rows ? rows.map((row) => structuredClone(row.row)) : await this.input.fallbackReadDataset(dataset);
  }

  private async open(load: () => Promise<PipelineRecord[]>): Promise<PipelineRecord[]> {
    let reference = await this.input.reference.read();
    let rows: SnapshotRow[];
    if (reference) {
      const held = await this.rows(reference.snapshotId);
      if (!held || held.length !== reference.count) throw new PipelineError("pipeline.source_snapshot_unavailable", "The execution's immutable source snapshot is unavailable.");
      rows = held;
    } else {
      const records = await load();
      const source = this.input.source;
      const privateSource = source.kind === "dataset" ? await this.rows(source.dataset.datasetId) : null;
      rows = records.map((record, index) => {
        const lineage = json(record.lineage);
        let row: JsonObject;
        if (source.kind === "input") row = { kind: "input", pointer: formatJsonPointer([...dataFieldPathSteps(source.field), index]), lineage };
        else if (source.kind === "dataset" && privateSource) {
          const original = privateSource[index];
          if (!original) throw new PipelineError("pipeline.source_snapshot_unavailable", "The private source enumeration changed while being captured.");
          row = { kind: "dataset", snapshotId: source.dataset.datasetId, occurrenceId: original.occurrenceId, lineage };
        } else {
          row = { kind: "record", data: record.data, lineage };
        }
        // No raw secret may hide in row values or binding/lineage metadata. A pointer must remain usable as written.
        if (JSON.stringify(fluxNodeWithheldRecords(row, this.input.secretTexts)) !== JSON.stringify(row)) throw new PipelineError("pipeline.secure_source_binding_required", "A secret in an ephemeral source or its metadata needs a safe caller-input or private dataset binding before mapped actions can start.");
        return { occurrenceId: randomUUID(), row };
      });
      reference = await this.input.snapshots.createImmutableSnapshot({ projectId: this.input.projectId, rows });
      // No mapped call sees the records until both the rows and their scope-owned reference have committed.
      await this.input.reference.write(reference);
    }
    const records: PipelineRecord[] = [];
    for (const { occurrenceId, row } of rows) {
      const data = await this.bound(row);
      const lineage = dataLineageSchema.array().safeParse(row["lineage"]);
      if (!lineage.success) throw new PipelineError("pipeline.source_snapshot_unreadable", "The stored source lineage is unreadable.");
      records.push({ data, lineage: [{ pointer: "", runId: this.input.runId, stepId: "source", source: { kind: "read", readId: `${reference.snapshotId}:${occurrenceId}` } }, ...lineage.data] });
    }
    return records;
  }

  private async bound(row: JsonObject): Promise<JsonObject> {
    let data: JsonValue | undefined;
    if (row["kind"] === "input" && typeof row["pointer"] === "string") data = bindingAt(this.input.inputs, row["pointer"]);
    else if (row["kind"] === "dataset" && typeof row["snapshotId"] === "string" && typeof row["occurrenceId"] === "string") {
      data = (await this.rows(row["snapshotId"]))?.find((source) => source.occurrenceId === row["occurrenceId"])?.row;
    } else if (row["kind"] === "record") data = row["data"];
    if (!isJsonObject(data)) throw new PipelineError("pipeline.source_binding_unavailable", "The execution's immutable source binding is unavailable.");
    return structuredClone(data);
  }

  private rows(snapshotId: string): Promise<SnapshotRow[] | null> {
    const held = this.privateRows.get(snapshotId);
    if (held) return held;
    const reading = (async () => {
      const rows: SnapshotRow[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await this.input.snapshots.readImmutableSnapshotPage({ projectId: this.input.projectId, snapshotId, ...(cursor === undefined ? {} : { cursor }) });
        if (!page) return null;
        rows.push(...page.rows);
        cursor = page.nextCursor;
        if (cursor !== undefined && seen.has(cursor)) throw new PipelineError("pipeline.source_snapshot_unreadable", "The immutable source snapshot repeated a page cursor.");
        if (cursor !== undefined) seen.add(cursor);
      } while (cursor !== undefined);
      return rows;
    })();
    this.privateRows.set(snapshotId, reading);
    return reading;
  }
}

function bindingAt(inputs: JsonObject, pointer: string): JsonValue | undefined {
  let value: JsonValue | undefined = inputs;
  for (const step of pointer.split("/").slice(1).map((key) => key.replace(/~1/gu, "/").replace(/~0/gu, "~"))) value = value !== null && typeof value === "object" && Object.hasOwn(value, step) ? (value as JsonObject)[step] : undefined;
  return value;
}

function json(value: unknown): JsonValue { return JSON.parse(JSON.stringify(value)) as JsonValue; }
