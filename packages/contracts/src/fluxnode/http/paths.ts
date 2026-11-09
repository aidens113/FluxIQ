// The FluxNode HTTP API's paths (plan, N9). One API in two places: `fluxiq dev`
// serves it locally and the cloud serves the same, so the SDK is a thin client of it.
// The version is in the path; a breaking change is a new version beside the old.

/** The API version these contracts describe. */
export const FLUXNODE_API_VERSION = "v1";

/** Where every FluxNode endpoint lives on an engine's origin. */
export const FLUXNODE_API_BASE_PATH = `/api/fluxnode/${FLUXNODE_API_VERSION}`;

/**
 * Each endpoint's path template; `{runId}` and `{name}` are filled by
 * `fluxNodeApiPath`.
 *
 * - `specs`: POST registers a spec;
 * - `runs`: POST starts a run; GET lists runs;
 * - `run`: GET a run's state and, once ended, its result;
 * - `runEvents`: GET the run's events as server-sent events;
 * - `runAnswers`: POST the program's answer to an event;
 * - `runStop`: POST stops a run;
 * - `fluxNodeExport`: POST exports a FluxNode's learned Flow, and pins it when asked.
 */
export const FLUXNODE_API_PATHS = Object.freeze({
  specs: `${FLUXNODE_API_BASE_PATH}/specs`,
  runs: `${FLUXNODE_API_BASE_PATH}/runs`,
  run: `${FLUXNODE_API_BASE_PATH}/runs/{runId}`,
  runEvents: `${FLUXNODE_API_BASE_PATH}/runs/{runId}/events`,
  runAnswers: `${FLUXNODE_API_BASE_PATH}/runs/{runId}/answers`,
  runStop: `${FLUXNODE_API_BASE_PATH}/runs/{runId}/stop`,
  fluxNodeExport: `${FLUXNODE_API_BASE_PATH}/fluxnodes/{name}/export`
} as const);

/** The HTTP method of each endpoint, keyed as `FLUXNODE_API_PATHS` is. `runs` has two: POST to start, GET to list. */
export const FLUXNODE_API_METHODS = Object.freeze({
  specs: ["POST"],
  runs: ["POST", "GET"],
  run: ["GET"],
  runEvents: ["GET"],
  runAnswers: ["POST"],
  runStop: ["POST"],
  fluxNodeExport: ["POST"]
} as const);

export type FluxNodeApiEndpoint = keyof typeof FLUXNODE_API_PATHS;

/**
 * An endpoint's path with its parameters filled and percent-encoded:
 * `fluxNodeApiPath("run", { runId: "r1" })` is `/api/fluxnode/v1/runs/r1`. Throws when
 * a parameter the template names is missing.
 */
export function fluxNodeApiPath(endpoint: FluxNodeApiEndpoint, params: { runId?: string; name?: string } = {}): string {
  return FLUXNODE_API_PATHS[endpoint].replace(/\{(runId|name)\}/gu, (_match, key: "runId" | "name") => {
    const value = params[key];
    if (value === undefined) throw new TypeError(`${endpoint} needs ${key}.`);
    return encodeURIComponent(value);
  });
}
