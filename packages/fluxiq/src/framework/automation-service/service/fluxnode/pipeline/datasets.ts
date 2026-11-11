import type { DatasetRef } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { PipelineError, type PipelineDatasetReader, type PipelineDatasetWriter } from "../../pipelines/index.ts";
import { fluxNodeWithheldRecords } from "../secrets/index.ts";

const UNSAFE = /[^A-Za-z0-9._:-]/gu;
const MOST_HELD = 64;

/** The datasets pipeline sinks store, kept in memory (the newest 64), and the readers a source or join reads them with. */
export type PipelineDatasets = {
  writerFor: (runId: string) => PipelineDatasetWriter;
  read: PipelineDatasetReader;
  /** Withholds secret values from every dataset this run stored, including those stored before the value was met. */
  withhold: (runId: string, secrets: readonly string[]) => void;
};

export function createPipelineDatasets(): PipelineDatasets {
  const held = new Map<string, { runId: string; rows: JsonObject[] }>();
  return {
    writerFor: (runId) => async (name, records): Promise<DatasetRef> => {
      const datasetId = `${runId}.${name}`.replace(UNSAFE, "_").slice(0, 128);
      held.delete(datasetId);
      held.set(datasetId, { runId, rows: records.map((record) => ({ ...record })) });
      for (const oldest of [...held.keys()].slice(0, Math.max(0, held.size - MOST_HELD))) held.delete(oldest);
      return { datasetId, runId, name: name.slice(0, 200), rowCount: records.length };
    },
    read: async (dataset) => {
      const rows = held.get(dataset.datasetId)?.rows;
      if (rows === undefined) throw new PipelineError("pipeline.unknown_dataset", `This engine holds no dataset "${dataset.datasetId}".`);
      return rows.map((row) => ({ ...row }));
    },
    withhold: (runId, secrets) => {
      for (const entry of held.values()) if (entry.runId === runId) entry.rows = fluxNodeWithheldRecords(entry.rows, secrets);
    }
  };
}
