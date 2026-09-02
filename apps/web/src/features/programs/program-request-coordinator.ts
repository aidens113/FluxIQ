import type { ApiResponse } from "./program-api";

export type ProgramRequestPolicy = {
  timeoutMs: number;
  retries: number;
  deduplicate: boolean;
  retryDelayMs: number;
};

type InFlightRequest = {
  controller: AbortController;
  consumers: number;
  settled: boolean;
  promise: Promise<ApiResponse<unknown>>;
};

const inFlight = new Map<string, InFlightRequest>();

export function programRequestPolicy(programId: string, endpoint: string, method: "GET" | "POST"): ProgramRequestPolicy {
  const safeRead = method === "GET" || /^(get-|list-)/.test(endpoint) || endpoint === "detail" || endpoint === "snapshot";
  if (!safeRead) {
    const longRunning = endpoint === "rebuild" || endpoint === "sync" || endpoint === "rollback" || endpoint === "run-migration";
    return { timeoutMs: longRunning ? 120_000 : 30_000, retries: 0, deduplicate: false, retryDelayMs: 0 };
  }
  if (programId === "docs") return { timeoutMs: 20_000, retries: 2, deduplicate: true, retryDelayMs: 200 };
  if (programId === "deployment-sync") return { timeoutMs: 20_000, retries: 2, deduplicate: true, retryDelayMs: 250 };
  return { timeoutMs: 15_000, retries: 2, deduplicate: true, retryDelayMs: 150 };
}

export async function coordinateProgramRequest<T>(params: {
  key: string;
  policy: ProgramRequestPolicy;
  signal?: AbortSignal;
  execute(signal: AbortSignal): Promise<ApiResponse<T>>;
}): Promise<ApiResponse<T>> {
  if (params.signal?.aborted) return abortedResponse();
  if (!params.policy.deduplicate) return runWithRetry(params.policy, params.signal, params.execute);

  let entry = inFlight.get(params.key);
  if (entry?.controller.signal.aborted) {
    if (inFlight.get(params.key) === entry) inFlight.delete(params.key);
    entry = undefined;
  }
  if (!entry) {
    const controller = new AbortController();
    const created: InFlightRequest = {
      controller,
      consumers: 0,
      settled: false,
      promise: runWithRetry(params.policy, controller.signal, params.execute) as Promise<ApiResponse<unknown>>
    };
    entry = created;
    inFlight.set(params.key, created);
    void created.promise.finally(() => {
      created.settled = true;
      if (inFlight.get(params.key) === created) inFlight.delete(params.key);
    });
  }

  entry.consumers += 1;
  return attachConsumer(entry, params.signal) as Promise<ApiResponse<T>>;
}

async function attachConsumer(entry: InFlightRequest, signal?: AbortSignal): Promise<ApiResponse<unknown>> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.consumers = Math.max(0, entry.consumers - 1);
    if (!entry.settled && entry.consumers === 0) entry.controller.abort();
  };
  if (!signal) {
    try { return await entry.promise; }
    finally { release(); }
  }
  return new Promise((resolve) => {
    const abort = () => { release(); resolve(abortedResponse()); };
    signal.addEventListener("abort", abort, { once: true });
    void entry.promise.then((result) => {
      if (released) return;
      signal.removeEventListener("abort", abort);
      release();
      resolve(result);
    });
  });
}

async function runWithRetry<T>(policy: ProgramRequestPolicy, outerSignal: AbortSignal | undefined, execute: (signal: AbortSignal) => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    if (outerSignal?.aborted) return abortedResponse();
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    outerSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, policy.timeoutMs);
    let result: ApiResponse<T>;
    try {
      result = await execute(controller.signal);
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", abort);
    }
    if (outerSignal?.aborted) return abortedResponse();
    if (timedOut) result = { ok: false, status: 408, code: "request_timeout", retryable: true, error: "Program request timed out." };
    if (result.ok || !result.retryable || attempt === policy.retries) return result;
    if (!await waitForRetry(policy.retryDelayMs * (2 ** attempt), outerSignal)) return abortedResponse();
  }
  return { ok: false, status: 0, code: "request_failed", retryable: true, error: "Program request could not be completed." };
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(true); }, delayMs);
    const abort = () => { clearTimeout(timer); resolve(false); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function abortedResponse<T>(): ApiResponse<T> {
  return { ok: false, aborted: true, status: 0, code: "request_aborted", retryable: false, error: "Program request was cancelled." };
}

export function resetProgramRequestCoordinatorForTests(): void {
  for (const entry of inFlight.values()) entry.controller.abort();
  inFlight.clear();
}
