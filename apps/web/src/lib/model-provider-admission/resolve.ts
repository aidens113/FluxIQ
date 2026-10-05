/** Provider admission is resolved before constructing any web host instance. */
export function resolveFluxIQModelProvidersEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const value = env.FLUXIQ_MODEL_PROVIDERS_ENABLED;
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("FLUXIQ_MODEL_PROVIDERS_ENABLED must be true or false when provided.");
}
