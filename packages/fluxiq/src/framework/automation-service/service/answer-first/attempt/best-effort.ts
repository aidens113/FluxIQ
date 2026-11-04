// Work that must not cost the attempt anything when it fails: reading or writing what a task
// remembers, or the Flow run's stage (design, "The hard rules"). What failed stays visible to the
// caller, which decides whether anyone is told.

/** Does `work`, and answers how it went rather than throwing. */
export async function automationStudioAnswerFirstBestEffort<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; errorName: string }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
