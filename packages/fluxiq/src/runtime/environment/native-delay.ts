/** The original unreferenced native wait, ending promptly when its signal aborts. */
export async function automationStudioNativeDelay(waitMs: number, signal?: AbortSignal): Promise<void> {
  if (!(waitMs > 0) || signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(done, waitMs);
    (timer as { unref?: () => void }).unref?.();
    signal?.addEventListener("abort", done, { once: true });
  });
}
