/** The public presentation view of a stored row; an absent view preserves every original field. */
export function automationStudioRunDatasetRowOfColumns<T extends Record<string, unknown>>(values: T, columns: readonly string[] | undefined): T {
  if (columns === undefined) return values;
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(values, column)) row[column] = values[column];
  }
  return row as T;
}
