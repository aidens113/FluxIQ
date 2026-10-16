import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";

/**
 * The verdict word the model gave on one ask, as distinct from what Core made
 * of it: a yes Core held for the exclusion evidence it lacked
 * (`exclusionEvidenceMissing`, `../verdict/`) is still the model's yes, and an
 * ask that gave no verdict -- no reply, a reply that could not be read, a cut
 * yes whose whole fields did not carry it -- said nothing (`undefined`).
 */
export function automationStudioResultModelSaid(verification: AutomationStudioResultVerification): AutomationStudioResultVerdict | undefined {
  if (verification.exclusionEvidenceMissing) return "answers";
  return verification.basis === "model" ? verification.verdict : undefined;
}
