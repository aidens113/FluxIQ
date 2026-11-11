/** The merged metadata with a `humanness: null` patch applied as removal of the key, never stored as null. */
export function withFlowHumannessPatch<T extends Record<string, any>>(merged: T, patch: Record<string, unknown>): T {
  if (patch.humanness !== null) return merged;
  const { humanness: _removed, ...rest } = merged;
  return rest as T;
}
