export type AutomationStudioInputPendingProbe = () => boolean;

export type AutomationStudioBackgroundScheduler = (
  callback: () => void,
  timeoutMs: number
) => () => void;

export type AutomationStudioBackgroundWorkPriority = "active" | "cache" | "preload";

export type AutomationStudioBackgroundWorkOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  isInputPending?: AutomationStudioInputPendingProbe;
  scheduler?: AutomationStudioBackgroundScheduler;
  priority?: AutomationStudioBackgroundWorkPriority;
  label?: string;
  onMetric?: (metric: AutomationStudioBackgroundWorkMetric) => void;
};

export type AutomationStudioBackgroundWorkMetric = {
  phase: "queued" | "yielded" | "started" | "finished" | "cancelled";
  priority: AutomationStudioBackgroundWorkPriority;
  label?: string;
  activeWorkCount: number;
};

let activeWorkCount = 0;

/**
 * Marks a user-visible request as active so preload and cache work yield until
 * the request has either started and completed or been cancelled.
 */
export function beginAutomationStudioActiveWork(): () => void {
  activeWorkCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeWorkCount = Math.max(0, activeWorkCount - 1);
  };
}

export function automationStudioActiveWorkIsPending(): boolean {
  return activeWorkCount > 0;
}

export async function runAutomationStudioActiveWork<T>(task: () => Promise<T>): Promise<T> {
  const release = beginAutomationStudioActiveWork();
  try {
    return await task();
  } finally {
    release();
  }
}

/**
 * Queues non-visual work after a paint and keeps yielding while the browser
 * reports pending input or a user-visible request has priority.
 */
export function scheduleAutomationStudioBackgroundWork(
  task: () => void | Promise<void>,
  options: AutomationStudioBackgroundWorkOptions = {}
): () => void {
  const signal = options.signal;
  const priority = options.priority ?? "cache";
  const scheduler = options.scheduler ?? scheduleAutomationStudioAfterPaintIdleWork;
  const inputPending = options.isInputPending ?? automationStudioInputIsPending;
  const releaseActiveWork = priority === "active" ? beginAutomationStudioActiveWork() : null;
  let cancelled = false;
  let started = false;
  let settled = false;
  let cancelScheduled: (() => void) | null = null;

  const emit = (phase: AutomationStudioBackgroundWorkMetric["phase"]) => {
    const metric: AutomationStudioBackgroundWorkMetric = {
      phase,
      priority,
      activeWorkCount,
      ...(options.label ? { label: options.label } : {})
    };
    options.onMetric?.(metric);
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<AutomationStudioBackgroundWorkMetric>(
      "automation-studio:background-work",
      { detail: metric }
    ));
  };

  const settle = () => {
    if (settled) return;
    settled = true;
    releaseActiveWork?.();
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    cancelScheduled?.();
    cancelScheduled = null;
    signal?.removeEventListener("abort", cancel);
    if (!started) settle();
    if (!started) emit("cancelled");
  };

  const run = async () => {
    cancelScheduled = null;
    if (cancelled || signal?.aborted) return cancel();
    const shouldYield = priority !== "active"
      && (inputPending() || automationStudioActiveWorkIsPending());
    if (shouldYield) {
      emit("yielded");
      cancelScheduled = scheduler(run, 50);
      return;
    }
    started = true;
    signal?.removeEventListener("abort", cancel);
    emit("started");
    try {
      await task();
    } catch {
      // Background work must never surface through the interaction path.
    } finally {
      settle();
      emit("finished");
    }
  };

  if (signal?.aborted) {
    cancel();
    return cancel;
  }
  signal?.addEventListener("abort", cancel, { once: true });
  emit("queued");
  cancelScheduled = scheduler(run, options.timeoutMs ?? 1_500);
  return cancel;
}

export function automationStudioInputIsPending(): boolean {
  if (typeof navigator === "undefined") return false;
  const scheduling = (navigator as Navigator & {
    scheduling?: { isInputPending?: (options?: { includeContinuous?: boolean }) => boolean };
  }).scheduling;
  try {
    return scheduling?.isInputPending?.({ includeContinuous: true }) === true;
  } catch {
    return false;
  }
}

export function scheduleAutomationStudioAfterPaintWork(callback: () => void): () => void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(callback);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }
  const handle = setTimeout(callback, 0);
  return () => clearTimeout(handle);
}

export function scheduleAutomationStudioAfterPaintIdleWork(
  callback: () => void,
  timeoutMs: number
): () => void {
  let cancelIdle: (() => void) | null = null;
  const cancelPaint = scheduleAutomationStudioAfterPaintWork(() => {
    cancelIdle = scheduleAutomationStudioIdleWork(callback, timeoutMs);
  });
  return () => {
    cancelPaint();
    cancelIdle?.();
  };
}

export function scheduleAutomationStudioIdleWork(callback: () => void, timeoutMs: number): () => void {
  if (typeof window !== "undefined") {
    const idleWindow = window as Window & {
      requestIdleCallback?: (handler: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => callback(), { timeout: Math.max(1, timeoutMs) });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
  }
  const handle = setTimeout(callback, Math.min(Math.max(timeoutMs, 1), 250));
  return () => clearTimeout(handle);
}
