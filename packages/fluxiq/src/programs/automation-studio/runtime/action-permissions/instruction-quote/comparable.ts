// The words an instruction read is compared on: case, spacing, typographic
// quotes and a trailing sentence mark do not decide whether a model copied the
// person's words. Moved unchanged out of `../instructed.ts` so the route read
// (`../instruction-route/`) grounds its quotes exactly as the permission read
// grounds its own.

/** Case, spacing and typographic quotes do not decide whether words were copied. */
export function automationStudioComparableInstructionText(text: string): string {
  return text.toLowerCase().replace(/[‘’]/gu, "'").replace(/[“”]/gu, "\"").replace(/\s+/gu, " ").trim().replace(/[.,;:!]+$/u, "");
}
