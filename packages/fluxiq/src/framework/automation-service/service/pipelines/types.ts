import type { DataLineage, DatasetRef, FlowCallTarget } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";

// The vocabulary of a data pipeline run: a record with its lineage, the ports a run
// is given instead of reaching out for them, and the context every step reads.

/** One record and where each part of it came from. `lineage` holds at most `PIPELINE_LINEAGE_LIMIT` entries. */
export type PipelineRecord = { data: JsonObject; lineage: DataLineage[] };

/** What a Flow call gave back: its outputs, and the lineage of those outputs (pointers into them). */
export type FlowCallResult = { outputs: JsonValue; lineage: DataLineage[] };

/** Calls a Flow once. The real caller is the FluxNode runner; tests use a fake. */
export type PipelineCallInvocation = { stepId: string; invocationId: string };
export type FlowCaller = (target: FlowCallTarget, inputs: JsonObject, signal: AbortSignal | undefined, invocation?: PipelineCallInvocation) => Promise<FlowCallResult>;

/** The answer of a webhook: only its status is read. */
export type PipelineFetchResponse = { ok: boolean; status: number };

export type PipelineFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal | undefined }) => Promise<PipelineFetchResponse>;

/** Stores records as a named dataset of the run, and says what was stored. */
export type PipelineDatasetWriter = (name: string, records: readonly JsonObject[]) => Promise<DatasetRef>;

/** Reads a stored dataset's rows, for a source or a join. */
export type PipelineDatasetReader = (dataset: DatasetRef) => Promise<JsonObject[]>;

/** Writes `content` at a path relative to the caller's directory. The writer refuses a path outside it. */
export type PipelineFileWriter = (relativePath: string, content: string) => Promise<void>;

/** The program's callbacks over the event stream: a `transform_needed` event, and a sink event. */
export type PipelineSdkPort = {
  transform: (request: { stepId: string; callback: string; records: JsonObject[] }) => Promise<JsonObject[]>;
  sink: (request: { stepId: string; callback: string; records: JsonObject[] }) => Promise<void>;
};

/** A reusable call result, with the lineage it came with. */
export type PipelineCachedCall = FlowCallResult;

/** What a pipeline remembers between runs, per project. */
export type PipelineState = {
  isProcessed: (projectId: string, pipeline: string, stepId: string, key: string) => Promise<boolean>;
  markProcessed: (projectId: string, pipeline: string, stepId: string, key: string) => Promise<void>;
  getCachedCall: (projectId: string, callKey: string, now: number) => Promise<PipelineCachedCall | undefined>;
  putCachedCall: (projectId: string, callKey: string, call: PipelineCachedCall, expiresAt: number) => Promise<void>;
};

export type PipelinePorts = {
  callFlow?: FlowCaller;
  /** Materializes and checkpoints the execution's immutable source enumeration before mapped calls. */
  sourceSnapshot?: (load: () => Promise<PipelineRecord[]>) => Promise<PipelineRecord[]>;
  fetch?: PipelineFetch;
  writeDataset?: PipelineDatasetWriter;
  readDataset?: PipelineDatasetReader;
  writeFile?: PipelineFileWriter;
  sdk?: PipelineSdkPort;
  state?: PipelineState;
  now?: () => number;
};

/** What every step of one run reads: who is running, the pipeline's inputs and the ports. */
export type PipelineRunContext = {
  runId: string;
  flowId?: string | undefined;
  projectId: string;
  pipeline: string;
  inputs: JsonObject;
  ports: PipelinePorts;
  signal?: AbortSignal | undefined;
};

/** The most lineage entries one record carries. */
export const PIPELINE_LINEAGE_LIMIT = 64;
