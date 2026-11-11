import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../index.ts";

/**
 * Runs one graph -- a root, or a child across a call boundary -- under its
 * deadline and its caller's cancellation, whichever comes first. A run the
 * bounds overtook is answered with a failed or cancelled trace and its command
 * run is stopped; the run itself sees its signal abort.
 *
 * The deadline runs on `startTimer`, the run's
 * `AutomationStudioGraphExecutionOptions.startTimer`, as a region's timeout does
 * (`../regions/execution.ts`): the real `setTimeout` when it is absent, exactly
 * as before; an environment's own timers when it supplies them.
 */
export async function runAutomationStudioChildWithBounds(run: (signal: AbortSignal) => Promise<AutomationStudioGraphExecutionTrace>, deadlineAt?: number, signal?: AbortSignal, now: () => number = Date.now, commandRun?: AutomationStudioGraphExecutionOptions["commandRun"], startTimer: NonNullable<AutomationStudioGraphExecutionOptions["startTimer"]> = startRealDeadlineTimer): Promise<AutomationStudioGraphExecutionTrace> {
  const startedAt = now();
  if (signal?.aborted) {
    await commandRun?.stop("executor.composite_cancelled");
    return { status: "cancelled", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Run cancelled." };
  }
  const controller = new AbortController();
  let timer: { cancel(): void } | undefined;
  let abortListener: (() => void) | undefined;
  const stop = async () => {
    await commandRun?.stop("executor.composite_stopped");
  };
  const bounds: Array<Promise<AutomationStudioGraphExecutionTrace>> = [];
  if (deadlineAt !== undefined) {
    bounds.push(new Promise((resolve, reject) => {
      timer = startTimer({ kind: "run_deadline" }, Math.max(0, deadlineAt - now()), () => {
        controller.abort(new Error("Flow execution deadline exceeded."));
        void stop().then(() => resolve({ status: "failed", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Flow execution deadline exceeded." }), reject);
      });
    }));
  }
  if (signal) {
    bounds.push(new Promise((resolve, reject) => {
      abortListener = () => {
        controller.abort(signal.reason);
        void stop().then(() => resolve({ status: "cancelled", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Run cancelled." }), reject);
      };
      signal.addEventListener("abort", abortListener, { once: true });
    }));
  }
  try {
    const start = () => run(controller.signal);
    const running = commandRun ? commandRun.own(start) : start();
    return bounds.length ? await Promise.race([running, ...bounds]) : await running;
  } finally {
    timer?.cancel();
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}

/** The run's deadline on the real clock, as it always ran. */
function startRealDeadlineTimer(_wait: { readonly kind: "region_timeout" | "run_deadline" }, delayMs: number, fire: () => void): { cancel(): void } {
  const timer = setTimeout(fire, delayMs);
  return { cancel: () => clearTimeout(timer) };
}
