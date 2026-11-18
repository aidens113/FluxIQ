/**
 * Next.js awaits register() once per server start, before serving a request.
 * The web runtime applies FLUXIQ_HOST_MODULE synchronously, then initializes
 * storage before requests can authenticate or write program state.
 *
 * When another process serves this data root (`fluxiq/server`'s data root
 * owner), the panel exits with that refusal. A failed register() alone does
 * not stop `next start` (15.5): it logs "Failed to prepare server" and keeps
 * listening, failing every request, a panel that looks up but cannot serve.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initializeFluxIQWebRuntime } = await import("./lib/fluxiq");
  try {
    await initializeFluxIQWebRuntime();
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "fluxiq.data_root_held") throw error;
    const { writeSync } = await import("node:fs");
    writeSync(2, `${(error as Error).message}\n`);
    process.exit(1);
  }
}
