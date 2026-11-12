// The FluxNode runner's surface (`docs/working/fluxnode-plan.md`, "FluxNode", N9): what the
// FluxNode HTTP API (`fluxiq/server`, `/api/fluxnode/v1`) calls, one method per endpoint. The
// bodies are the contracts' (`@fluxiq/contracts/fluxnode`); this adds only who is calling and
// how a refusal comes back. Stable for P2b: the runner implements it, the HTTP API consumes it.

import type {
  FluxNodeAnswerEventResponse,
  FluxNodeErrorCode,
  FluxNodeEventAnswer,
  FluxNodeExportFlowRequest,
  FluxNodeFlowExport,
  FluxNodeIssue,
  FluxNodeListRunsQuery,
  FluxNodeListRunsResponse,
  FluxNodeRegisterSpecRequest,
  FluxNodeRegisterSpecResponse,
  FluxNodeRunEvent,
  FluxNodeRunRequest,
  FluxNodeRunStateBody,
  FluxNodeStopRunRequest
} from "@fluxiq/contracts/fluxnode";

/**
 * Who a call acts as. Keys are P3b's; until then the only caller is the local owner in open
 * mode, under `FluxNodeRunner` rights (run Flows in the owner's FluxNode project), never an
 * administrator (plan, K4 and K8).
 */
export type FluxNodeCaller = {
  principal: "owner";
  policy: "FluxNodeRunner";
  via: "open_mode";
};

/** A refused call: the contracts' error code, safe words, and where the body was wrong. */
export type FluxNodeServiceRefusal = {
  code: FluxNodeErrorCode;
  message: string;
  issues?: FluxNodeIssue[];
};

/** Every method answers this; a refusal is never a run ending (`FLUXNODE_RUN_STATUSES` are those). */
export type FluxNodeServiceOutcome<T> = { ok: true; value: T } | { ok: false; refusal: FluxNodeServiceRefusal };

/**
 * One method per endpoint. Bodies arrive already parsed by the contracts' schemas; the
 * service still checks what only it can (a registered name, inputs against a registered
 * spec, an event that waits, a run that has not ended).
 *
 * - `register`: POST specs. Idempotent by name and hash.
 * - `start`: POST runs. Returns as soon as the run is under way (`state: "running"`), or
 *   the stored state for a repeated `idempotencyKey`. The run goes on after the call
 *   returns; its events and `get` tell how it went.
 * - `get`: GET runs/{runId}.
 * - `events`: GET runs/{runId}/events. Every event after `afterSeq` (0 for all), stored
 *   ones first, then live ones as they happen, ending after `ended`. The iteration stops
 *   early when `signal` aborts (the client went away); that never stops the run.
 * - `answer`: POST runs/{runId}/answers.
 * - `stop`: POST runs/{runId}/stop. The run ends `stopped` with what it has.
 * - `list`: GET runs, newest first.
 * - `exportFlow`: POST fluxnodes/{name}/export, pinning when asked (plan, N8).
 */
export type FluxNodeService = {
  /** In-process lifecycle only: refuse new work, stop admitted runs and await their finalization. Not an HTTP endpoint. */
  close?(): Promise<void>;
  register(caller: FluxNodeCaller, request: FluxNodeRegisterSpecRequest): Promise<FluxNodeServiceOutcome<FluxNodeRegisterSpecResponse>>;
  start(caller: FluxNodeCaller, request: FluxNodeRunRequest): Promise<FluxNodeServiceOutcome<FluxNodeRunStateBody>>;
  get(caller: FluxNodeCaller, runId: string): Promise<FluxNodeServiceOutcome<FluxNodeRunStateBody>>;
  events(caller: FluxNodeCaller, runId: string, afterSeq: number, signal: AbortSignal): Promise<FluxNodeServiceOutcome<AsyncIterable<FluxNodeRunEvent>>>;
  answer(caller: FluxNodeCaller, runId: string, answer: FluxNodeEventAnswer): Promise<FluxNodeServiceOutcome<FluxNodeAnswerEventResponse>>;
  stop(caller: FluxNodeCaller, runId: string, request: FluxNodeStopRunRequest): Promise<FluxNodeServiceOutcome<FluxNodeRunStateBody>>;
  list(caller: FluxNodeCaller, query: FluxNodeListRunsQuery): Promise<FluxNodeServiceOutcome<FluxNodeListRunsResponse>>;
  exportFlow(caller: FluxNodeCaller, name: string, request: FluxNodeExportFlowRequest): Promise<FluxNodeServiceOutcome<FluxNodeFlowExport>>;
};
