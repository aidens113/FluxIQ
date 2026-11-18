export type AppRegistryFailure = "invalid_request" | "unavailable" | "forbidden" | "conflict" | "target_unavailable" | "stale_resolution";

/** Fixed public feedback; supplied values and internal storage errors stay out of it. */
export class AppRegistryServiceError extends Error {
  constructor(readonly code: AppRegistryFailure) {
    super("The app request could not be authorized or resolved.");
    this.name = "AppRegistryServiceError";
  }
}
