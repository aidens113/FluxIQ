/** Presentation predicates only; arbitrary result/metadata values are not traversed. */
export const payloadFields = {
  record: (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value),
  string: (value: unknown): value is string => typeof value === "string",
  strings: (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string"),
  number: (value: unknown): value is number => typeof value === "number" && Number.isFinite(value),
  optionalString: (value: unknown) => value === undefined || typeof value === "string",
  optionalNumber: (value: unknown) => value === undefined || typeof value === "number" && Number.isFinite(value),
  nullableNumber: (value: unknown) => value == null || typeof value === "number" && Number.isFinite(value),
  nullableString: (value: unknown) => value == null || typeof value === "string",
  optionalRecord: (value: unknown) => value === undefined || value !== null && typeof value === "object" && !Array.isArray(value)
};
