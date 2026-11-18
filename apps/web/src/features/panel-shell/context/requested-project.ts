import { readStoredProject } from "./project-storage";

export const PROJECT_PARAM = "project";

/**
 * The project the person asked for: `?project=` in the address wins over what this browser remembered.
 * Undefined when neither names one (or the address cannot be read).
 */
export function requestedProject(search: string | undefined): string | undefined {
  let fromAddress: string | undefined;
  try {
    fromAddress = new URLSearchParams(search ?? "").get(PROJECT_PARAM)?.trim() || undefined;
  } catch {
    fromAddress = undefined;
  }
  if (fromAddress !== undefined) return fromAddress;
  const stored = readStoredProject();
  return stored.ok ? stored.value : undefined;
}
