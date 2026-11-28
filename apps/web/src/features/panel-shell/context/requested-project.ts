export const PROJECT_PARAM = "project";

/**
 * The project the address asks for (`?project=`), which wins over Core's current project and over
 * what this browser remembered. Undefined when the address names none.
 */
export function requestedProject(search: string | undefined): string | undefined {
  return new URLSearchParams(search ?? "").get(PROJECT_PARAM)?.trim() || undefined;
}
