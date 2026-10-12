import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../executor.ts";

/**
 * Runs one graph -- a root, or a child across a call boundary -- under its
 * deadline and its caller's cancellation, whichever comes first. A run the
 * bounds overtook is answered with a failed or cancelled trace and its command
 * run is stopped; the run itself sees its signal abort.
 */
export async function runAutomationStudioChildWithBounds(run: (signal: AbortSignal) => Promise<AutomationStudioGraphExecutionTrace>, deadlineAt?: number, signal?: AbortSignal, now: () => number = Date.now, commandRun?: AutomationStudioGraphExecutionOptions["commandRun"]): Promise<AutomationStudioGraphExecutionTrace> {
  const startedAt = now();
  if (signal?.aborted) {
    await commandRun?.stop("executor.composite_cancelled");
    return { status: "cancelled", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Run cancelled." };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const stop = async () => {
    await commandRun?.stop("executor.composite_stopped");
  };
  const bounds: Array<Promise<AutomationStudioGraphExecutionTrace>> = [];
  if (deadlineAt !== undefined) {
    bounds.push(new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(new Error("Flow execution deadline exceeded."));
        void stop().then(() => resolve({ status: "failed", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Flow execution deadline exceeded." }), reject);
      }, Math.max(0, deadlineAt - now()));
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
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}
