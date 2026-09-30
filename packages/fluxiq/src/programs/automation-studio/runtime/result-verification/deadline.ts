// The bound that makes a result verification safe to reach.
//
// On 2026-09-20 (t024) a verification reached from an empty result entered
// provider resolution and never came back: the live run's playback had
// succeeded, its records and its run detail were durable, and the request that
// started it was still unanswered ten minutes later with every process alive.
// It was never root-caused. The worker's two reports falsified the database
// lifetime hypothesis, narrowed the unresolved await to provider resolution,
// and then settled the matter by never resolving a provider for an empty
// result at all -- which is a workaround, and it cost the product the one
// judgement it most needed: an empty table where the person asked for rows was
// the only result in FluxIQ nobody ever looked at.
//
// So the exemption is gone and this is what replaces it. Everything from
// resolving the provider to the second verification call runs inside one
// deadline. A verification that does not settle in time stops being a
// verification and becomes a stated reason there is none -- which is exactly
// what the run already records when no model is configured, and is strictly
// better than never asking.
//
// **Why a deadline rather than a fix for the hang.** The hang has no named
// cause to fix. Every promise on that path is somebody else's -- the host's
// provider resolver, the session-key release and its validation, the
// project database's serialized operation queue -- and a bound is the only
// guard that holds whichever of them stops settling. If the cause is ever
// named, this stays: a verification that cannot end is worse than one that
// says it could not finish.
//
// The abandoned promise is deliberately left to settle on its own. Nothing is
// written from it: the caller discards its value, and the only writes a
// verification makes happen after this returns.

/**
 * How long the whole of a verification may take: resolving a provider, reading
 * the instructions and the run detail, and both calls.
 *
 * Two calls at the harness's own per-call ceiling fit inside it with room for
 * the reads around them, so a deadline reached here means something stopped
 * settling rather than that the model was slow.
 */
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS = 120_000;

/** What a bounded verification came to: its value, or why there is none. */
export type AutomationStudioResultVerificationBounded<TValue> =
  | { settled: true; value: TValue }
  | { settled: false; reason: "timed_out" | "aborted" | "threw"; error?: unknown };

/**
 * Run `judge` under a deadline and the run's own cancellation.
 *
 * Never rejects. A throw is returned in the same shape as a deadline, because
 * a caller that must record *something* about every finished run cannot have
 * one of the three outcomes arrive as an exception -- an escaped rejection here
 * is how a finished run ends up with no verification record at all.
 */
export async function automationStudioResultVerificationWithinDeadline<TValue>(input: {
  deadlineMs?: number | undefined;
  signal?: AbortSignal | undefined;
  judge: () => Promise<TValue>;
}): Promise<AutomationStudioResultVerificationBounded<TValue>> {
  const deadlineMs = input.deadlineMs ?? AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS;
  const judged = judge(input.judge);
  if (!(deadlineMs > 0) && !input.signal) return await judged;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const expired = new Promise<AutomationStudioResultVerificationBounded<TValue>>((resolve) => {
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

async function judge<TValue>(run: () => Promise<TValue>): Promise<AutomationStudioResultVerificationBounded<TValue>> {
  try {
    return { settled: true, value: await run() };
  } catch (error) {
    return { settled: false, reason: "threw", error };
  }
}
