import type { SecretKeyRecord, SecretKeySummary } from "../../../types.ts";

export function secretKeySummary(record: SecretKeyRecord): SecretKeySummary {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    ...(record.provider ? { provider: record.provider } : {}),
    scope: record.scope,
    ...(record.scopeRef ? { scopeRef: record.scopeRef } : {}),
    ...(record.description ? { description: record.description } : {}),
    enabled: record.enabled,
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    lastRotatedAtMs: record.lastRotatedAtMs,
    ...(record.lastRevealedAtMs ? { lastRevealedAtMs: record.lastRevealedAtMs } : {}),
    ...(record.metadata ? { metadata: record.metadata } : {})
  };
}
