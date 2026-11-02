/** Public diagnostics carry bounded identifiers, never arbitrary callback text. */
export function recordingMappingIdentity(value: string): string {
  return /^[A-Za-z0-9._:/-]{1,160}$/.test(value) ? value : "[unavailable]";
}
