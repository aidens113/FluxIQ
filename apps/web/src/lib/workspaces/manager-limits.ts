/**
 * The manager's bounds from the environment: `FLUXIQ_WORKSPACE_IDLE_MS` (how
 * long an unused workspace stays open) and `FLUXIQ_WORKSPACE_CACHE_MAX` (how
 * many stay open at most). Unset leaves the manager's defaults; a value that
 * is not a positive whole number refuses, so a typo never silently becomes
 * the default.
 */
export function workspaceManagerLimits(env: Readonly<Record<string, string | undefined>> = process.env): { idleMs?: number; cacheMax?: number } {
  const idleMs = positiveWholeNumber(env, "FLUXIQ_WORKSPACE_IDLE_MS");
  const cacheMax = positiveWholeNumber(env, "FLUXIQ_WORKSPACE_CACHE_MAX");
  return { ...(idleMs === undefined ? {} : { idleMs }), ...(cacheMax === undefined ? {} : { cacheMax }) };
}

function positiveWholeNumber(env: Readonly<Record<string, string | undefined>>, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number when provided.`);
  }
  return value;
}
