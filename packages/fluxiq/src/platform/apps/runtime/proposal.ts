import { parseAppInstallation } from "@fluxiq/contracts/apps";
import type { AppInstallProposal } from "../model/index.ts";
import { AppRegistryServiceError } from "./service-error.ts";

/** Parse only requested configuration; identity/time/generation are always supplied by the server. */
export function appInstallProposal(input: unknown): AppInstallProposal {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["app", "approvedGrants", "target", "payer"].includes(key))) throw new AppRegistryServiceError("invalid_request");
  const parsed = parseAppInstallation({ ...input, schemaVersion: 1, installationId: "pending", workspaceId: "pending", installedByUserId: "pending", installedAtMs: 0, updatedAtMs: 0, generation: 1, revision: 1, status: "active" });
  if (!parsed.ok) throw new AppRegistryServiceError("invalid_request");
  const { app, approvedGrants, target, payer } = parsed.value;
  return structuredClone({ app, approvedGrants, target, payer });
}
