import { humannessSchema } from "@fluxiq/contracts/automation";

/**
 * Refuses a humanness no run could use, naming it. Absent leaves what is
 * stored; `null` asks to clear it.
 */
export function assertFlowHumanness(value: unknown): void {
  if (value === undefined || value === null) return;
  if (!humannessSchema.safeParse(value).success) throw new Error("humanness must be a whole number from 0 to 100, or null to clear it.");
}
