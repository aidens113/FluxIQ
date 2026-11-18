import path from "node:path";
import { createKeySessionService, createSQLiteKeyStore } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getFluxIQAfterReload } from "../../lib/fluxiq";
import { primaryWorkspaceId, workspaceTenancyOfProfile } from "../../lib/workspaces";
import { keySessionConfig } from "./config";
import { keySessionEligible } from "./eligibility";
import { keySessionCompositions as compositions } from "./compositions";

type Composition = { store: Awaited<ReturnType<typeof createSQLiteKeyStore>>; service: ReturnType<typeof createKeySessionService> };

/** The web server's durable SDK authority. No listeners or cloud calls are started here. */
export async function getKeySessionService(): Promise<Composition["service"]> {
  const fluxiq = await getFluxIQAfterReload();
  const root = path.resolve(fluxiq.paths.fluxiq);
  const config = keySessionConfig();
  const key = JSON.stringify([root, config.origin, config.instanceId]);
  let pending = compositions.get(key);
  if (!pending) {
    pending = compose(root, config);
    compositions.set(key, pending);
    void pending.catch(() => { if (compositions.get(key) === pending) compositions.delete(key); });
  }
  return (await pending).service;
}

async function compose(root: string, config: ReturnType<typeof keySessionConfig>): Promise<Composition> {
  const store = await createSQLiteKeyStore({ filePath: path.join(root, "platform", "keys.sqlite") });
  const tenancy = workspaceTenancyOfProfile(resolveFluxIQDeploymentSettings(process.env).profile);
  const service = createKeySessionService({
    store, ...config,
    eligible: async ({ userId, workspaceId }) => {
      const fluxiq = await getFluxIQAfterReload();
      const platform = await (await import("../provisioning-listener")).getPlatformServices();
      return keySessionEligible({
        userId, workspaceId, tenancy, primaryWorkspaceId: primaryWorkspaceId(), store: platform.store,
        enabledUser: async (id) => (await fluxiq.programs.identityAccess.snapshot()).users.some((user) => user.id === id && user.enabled)
      });
    }
  });
  return { store, service };
}
