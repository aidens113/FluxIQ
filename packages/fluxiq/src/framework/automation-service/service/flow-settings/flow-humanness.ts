import { humannessSchema } from "@fluxiq/contracts/automation";

/**
 * The humanness level a Flow stores for itself (`metadata.humanness`), or
 * undefined when it has none of its own, so the run falls through to the
 * person's starting value. A stored value no save would have taken reads as none.
 */
export function automationStudioFlowHumanness(metadata: { humanness?: unknown } | null | undefined): number | undefined {
  const parsed = humannessSchema.safeParse(metadata?.humanness);
  return parsed.success ? parsed.data : undefined;
}
