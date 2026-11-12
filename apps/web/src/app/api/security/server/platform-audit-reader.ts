import type { AuditReader } from "./types";

/**
 * The platform's IAM audit (`<fluxiq>/platform/iam-audit.sqlite`), read only,
 * through the one store `server/provisioning-listener/platform-services.ts`
 * opens per host root and shares with every bundle.
 */
export async function platformAuditReader(): Promise<AuditReader> {
  const { readPlatformIamAudit } = await import("../../../../server/provisioning-listener");
  return { read: (query) => readPlatformIamAudit(query) };
}
