import { shortJson } from "../../../programs/format";

export function isSensitiveDatabaseStore(kind: string): boolean {
  const key = kind.trim().toLowerCase();
  return key === "identity.users" || key === "secret.keys";
}

export function sensitiveStoreKey(kind: string, database: string): string {
  return `${database}:${kind.trim().toLowerCase()}`;
}

export function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}
