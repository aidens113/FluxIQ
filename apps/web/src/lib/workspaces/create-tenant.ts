import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fluxiqLayoutV3Paths, fluxiqWorkspaceRootDir, initializeFluxIQLayoutV3, type FluxIQ, type FluxIQOptions } from "fluxiq";
import type { HeldKeys } from "fluxiq/secret-keys";
import { initializeFluxIQWebStorage } from "./initialize-storage";

/** The environment settings that place an instance's storage; any of them pointing outside a tenant's root would share it between tenants. */
const STORAGE_DIRECTORY_SETTINGS = [
  "FLUXIQ_DIR", "FLUXIQ_DATA_DIR", "FLUXIQ_DATABASES_DIR", "FLUXIQ_INPUTS_DIR", "FLUXIQ_OUTPUTS_DIR", "FLUXIQ_STREAMS_DIR",
  "FLUXIQ_DOMAINS_DIR", "FLUXIQ_DOMAIN_PROGRAMS_DIR", "FLUXIQ_DOMAIN_INPUTS_DIR", "FLUXIQ_DOMAIN_OUTPUTS_DIR",
  "FLUXIQ_DOMAIN_CONFIGS_DIR", "FLUXIQ_DOMAIN_DATA_DIR", "FLUXIQ_DOMAIN_DATABASES_DIR", "FLUXIQ_RECORDINGS_DIR",
  "FLUXIQ_POLICIES_DIR", "FLUXIQ_LOGS_DIR", "FLUXIQ_TEMP_DIR"
] as const;

/**
 * Opens a tenant workspace's instance under layout v3: the layout under
 * `dataRoot` (the primary's host root) is initialized first, the tenant's root
 * is `<dataRoot>/workspaces/<workspaceId>`, and its storage is readied as the
 * primary's is. `instantiate` builds the instance (the host module applied);
 * it is given the root, `loadEnv: false`, the manager's custody and the IAM.
 *
 * Refuses a storage directory setting in the environment that would resolve
 * outside the tenant's root, since every tenant would then share it.
 */
export async function createTenantFluxIQ(input: {
  workspaceId: string;
  heldKeys: HeldKeys;
  dataRoot: string;
  iam?: FluxIQOptions["iam"];
  instantiate: (options: FluxIQOptions) => Promise<FluxIQ> | FluxIQ;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<FluxIQ> {
  const layout = await initializeFluxIQLayoutV3(fluxiqLayoutV3Paths(input.dataRoot));
  const rootDir = fluxiqWorkspaceRootDir(layout, input.workspaceId);
  refuseSharedStorageSettings(rootDir, input.env ?? process.env);
  await mkdir(rootDir, { recursive: true });
  const fluxiq = await input.instantiate({ rootDir, loadEnv: false, heldKeys: input.heldKeys, ...(input.iam ? { iam: input.iam } : {}) });
  try {
    await initializeFluxIQWebStorage(fluxiq);
  } catch (error) {
    try {
      await fluxiq.close({ mode: "evict" });
    } catch (closeError) {
      throw new AggregateError([error, closeError], "workspaces.tenant_open_failed");
    }
    throw error;
  }
  return fluxiq;
}

function refuseSharedStorageSettings(rootDir: string, env: Readonly<Record<string, string | undefined>>): void {
  for (const name of STORAGE_DIRECTORY_SETTINGS) {
    const value = env[name]?.trim();
    if (!value) continue;
    const relative = path.relative(rootDir, path.resolve(rootDir, value));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`workspaces.shared_storage_refused: ${name} places storage outside the workspace root, which every workspace would share; unset it under the service profile`);
    }
  }
}
