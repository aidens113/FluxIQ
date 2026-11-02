import { RESULT_VERIFICATION_DEADLINE_MS } from "./deadline-ms.ts";
import type { ResultVerificationBounded } from "./bounded.ts";

/** A timeout bounds waiting; it never certifies cancellation or execution quiescence. */
export async function resultVerificationWithinDeadline<TValue>(input: {
  deadlineMs?: number | undefined;
  signal?: AbortSignal | undefined;
  judge: () => Promise<TValue>;
}): Promise<ResultVerificationBounded<TValue>> {
  const deadlineMs = input.deadlineMs ?? RESULT_VERIFICATION_DEADLINE_MS;
  const judged = judge(input.judge);
  if (!(deadlineMs > 0) && !input.signal) return await judged;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const expired = new Promise<ResultVerificationBounded<TValue>>((resolve) => {
    if (deadlineMs > 0) {
      timer = setTimeout(() => resolve({ settled: false, reason: "timed_out" }), deadlineMs);
      // A verification deadline must never be the reason a process stays alive.
      timer.unref?.();
    }
    if (input.signal?.aborted) resolve({ settled: false, reason: "aborted" });
    else if (input.signal) {
      onAbort = () => resolve({ settled: false, reason: "aborted" });
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([judged, expired]);
  } finally {
    clearTimeout(timer);
    if (onAbort) input.signal?.removeEventListener("abort", onAbort);
  }
}

async function judge<TValue>(run: () => Promise<TValue>): Promise<ResultVerificationBounded<TValue>> {
  try {
    return { settled: true, value: await run() };
  } catch (error) {
    return { settled: false, reason: "threw", error };
  }
}
