export type AppStoreFailure = "manifest_conflict" | "invalid_record" | "authority_changed" | "storage_unavailable" | "store_closed";

/** Fixed storage feedback never echoes a manifest, operation input or SQL payload. */
export class AppStoreError extends Error {
  constructor(readonly code: AppStoreFailure) {
    super("The app registry operation could not be completed.");
    this.name = "AppStoreError";
  }
}
