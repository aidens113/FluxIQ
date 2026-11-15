import { parseAppInstallation, validateAppInstallationAgainstManifest, verifyAppManifest, type AppInstallationV1, type AppManifestV1 } from "@fluxiq/contracts/apps";
import type { AppRegistryStore } from "../model/index.ts";
import { AppRegistryServiceError } from "./service-error.ts";

export async function currentAppInstallation(store: AppRegistryStore, id: string): Promise<{ installation: AppInstallationV1; manifest: AppManifestV1 }> {
  const parsed = parseAppInstallation(await store.getInstallation(id));
  if (!parsed.ok) throw new AppRegistryServiceError("unavailable");
  const manifest = await verifyAppManifest(await store.getManifest(parsed.value.app));
  if (!manifest.ok || !validateAppInstallationAgainstManifest(parsed.value, manifest.value).ok) throw new AppRegistryServiceError("unavailable");
  return { installation: parsed.value, manifest: manifest.value };
}
