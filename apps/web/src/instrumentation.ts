/**
 * Next.js awaits register() once per server start, before serving a request.
 * The web runtime applies FLUXIQ_HOST_MODULE synchronously, then initializes
 * storage before requests can authenticate or write program state.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initializeFluxIQWebRuntime } = await import("./lib/fluxiq");
  await initializeFluxIQWebRuntime();
}
