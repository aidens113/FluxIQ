/**
 * Next.js awaits register() once per server start, before serving a request.
 * The web runtime applies FLUXIQ_HOST_MODULE synchronously, then initializes
 * storage before requests can authenticate or write program state.
 *
 * A runtime that cannot start ends the process with a plain message and exit
 * code 1. A failed register() alone does not stop `next start` (15.5): it logs
 * "Failed to prepare server" and keeps listening, failing every request, a
 * panel that looks up but cannot serve. Another process serving this data root
 * (`fluxiq/server`'s data root owner) is one such failure; its message is
 * already the whole story, so no details follow it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { initializeFluxIQWebRuntime } = await import("./lib/fluxiq");
    await initializeFluxIQWebRuntime();
  } catch (error) {
    const { writeSync } = await import("node:fs");
    writeSync(2, `${startupFailure(error)}\n`);
    process.exit(1);
  }
}

function startupFailure(error: unknown): string {
  if ((error as { code?: unknown } | null)?.code === "fluxiq.data_root_held") return (error as Error).message;
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof Error && error.stack ? `\n\nDetails:\n${error.stack}` : "";
  return `The FluxIQ web panel could not start: ${message}${details}`;
}
