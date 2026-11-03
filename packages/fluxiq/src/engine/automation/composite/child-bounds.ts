import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../index.ts";
import { automationCallbackObservation, automationObservedClock, AutomationExecutionPorts } from "../execution-admission/kernel/index.ts";

/**
 * Runs one graph -- a root, or a child across a call boundary -- under its
 * deadline and its caller's cancellation, whichever comes first. A run the
 * bounds overtook is answered with a failed or cancelled trace and its command
 * run is stopped; the run itself sees its signal abort.
 */
export async function runAutomationStudioChildWithBounds(run: (signal: AbortSignal) => Promise<AutomationStudioGraphExecutionTrace>, deadlineAt?: number, signal?: AbortSignal, now?: () => number, commandRun?: AutomationStudioGraphExecutionOptions["commandRun"], options?: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  const observation = options ? automationCallbackObservation(options) : undefined;
  const clock = now ?? (observation ? automationObservedClock(observation, {}, undefined) : Date.now);
  const stop = async (reason: string) => {
    await AutomationExecutionPorts.method(options, commandRun, "stop")?.stop(reason);
  };
  const startedAt = clock();
  if (signal?.aborted) {
    await stop("executor.composite_cancelled");
    return { status: "cancelled", startedAt, finishedAt: clock(), attempts: [], values: {}, effects: [], message: "Run cancelled." };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const bounds: Array<Promise<AutomationStudioGraphExecutionTrace>> = [];
  if (deadlineAt !== undefined) {
    bounds.push(new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(new Error("Flow execution deadline exceeded."));
        void stop("executor.composite_stopped").then((): AutomationStudioGraphExecutionTrace => ({ status: "failed", startedAt, finishedAt: clock(), attempts: [], values: {}, effects: [], message: "Flow execution deadline exceeded." })).then(resolve, reject);
      }, Math.max(0, deadlineAt - clock()));
    }));
  }
  if (signal) {
    bounds.push(new Promise((resolve, reject) => {
      abortListener = () => {
        controller.abort(signal.reason);
        void stop("executor.composite_stopped").then((): AutomationStudioGraphExecutionTrace => ({ status: "cancelled", startedAt, finishedAt: clock(), attempts: [], values: {}, effects: [], message: "Run cancelled." })).then(resolve, reject);
      };
      signal.addEventListener("abort", abortListener, { once: true });
    }));
  }
  try {
    const start = () => run(controller.signal);
    const owner = AutomationExecutionPorts.method(options, commandRun, "own");
    const running = owner ? owner.own(start) : start();
    return bounds.length ? await Promise.race([running, ...bounds]) : await running;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}
