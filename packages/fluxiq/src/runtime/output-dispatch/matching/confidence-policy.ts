import type { DomainOutputDefinition } from "../../../domains/index.ts";
export function outputTargetMinimumConfidence(configured: unknown, safetyLevel: NonNullable<DomainOutputDefinition["safety"]>["level"] | undefined): number {
  if (typeof configured === "number" && Number.isFinite(configured))
    return Math.max(0, Math.min(1, configured));
  switch (safetyLevel) {
    case "destructive": return 0.9;
    case "privileged": return 0.82;
    case "review": return 0.68;
    case "safe": return 0.45;
    default: return 0.5;
  }
}
