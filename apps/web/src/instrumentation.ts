/**
 * Next.js awaits register() once per server start, before serving a request.
 * The web runtime applies FLUXIQ_HOST_MODULE synchronously, so its native
 * import() has to finish here first; see loadFluxIQHostModule().
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadFluxIQHostModule } = await import("./lib/fluxiq");
  await loadFluxIQHostModule();
}
