/**
 * Splits `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS` into its raw entries. The
 * entries are not judged here: the transport parses them with the contract's
 * Origin grammar at start (`./origin-policy.ts`).
 */
export function parseAllowedOrigins(value?: string): string[] | undefined {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins?.length ? origins : undefined;
}
