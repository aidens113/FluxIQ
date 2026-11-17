import path from "node:path";
import { createConnectService, createSqliteConnectCodeRepository, type ConnectService } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { validateConnectApproval } from "./approval";
import { connectCompositions } from "./compositions";
import { issueConnectCredential } from "./issue-credential";

export async function getConnectService(): Promise<ConnectService> {
  const { getFluxIQAfterReload } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const settings = resolveFluxIQDeploymentSettings(process.env);
  if (settings.profile !== "service") throw new Error("Hosted connect is not enabled for this deployment.");
  const root = path.resolve(primary.paths.fluxiq);
  const key = JSON.stringify([root, settings.publicOrigin, settings.gateway.publicUrl]);
  const existing = connectCompositions.get(key);
  if (existing) return existing.service;
  const repository = createSqliteConnectCodeRepository({ filePath: path.join(root, "platform", "connect.sqlite") });
  const service = createConnectService({
    repository, instanceOrigin: settings.publicOrigin, gatewayUrl: settings.gateway.publicUrl,
    validateApprovalSession: validateConnectApproval, issueCredential: issueConnectCredential
  });
  connectCompositions.set(key, { root, repository, service });
  return service;
}
