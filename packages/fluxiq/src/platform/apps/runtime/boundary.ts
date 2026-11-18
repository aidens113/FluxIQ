import { AppStoreError } from "../model/index.ts";
import { AppRegistryServiceError } from "./service-error.ts";

/** Keep persistence, authority provider and parser details out of app-facing failures. */
export async function appRegistryBoundary<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AppRegistryServiceError) throw error;
    if (error instanceof AppStoreError) {
      if (error.code === "authority_changed") throw new AppRegistryServiceError("forbidden");
      if (error.code === "manifest_conflict") throw new AppRegistryServiceError("conflict");
      if (error.code === "invalid_record") throw new AppRegistryServiceError("invalid_request");
    }
    throw new AppRegistryServiceError("unavailable");
  }
}
