import { AppStoreError } from "../model/index.ts";

/** Each component is encoded separately so identifiers cannot change record namespaces. */
export function appRecordKey(kind: string, ...parts: string[]): string {
  if (parts.some((part) => typeof part !== "string" || !part || part.trim() !== part)) throw new AppStoreError("invalid_record");
  return `${kind}/${parts.map(encodeURIComponent).join("/")}`;
}
