import { isDeepStrictEqual } from "node:util";
import { appGrantCovers, parseAppInvocation, parseAppOperationResolution, validateAppOperationInputs, type AppInstallationV1, type AppManifestV1, type AppOperation, type AppOperationResolutionV1 } from "@fluxiq/contracts/apps";
import type { AppOperationActor, AppRegistryAuthority, AppRegistryStore, AppRegistryTargetCheck } from "../model/index.ts";
import { currentAppInstallation } from "./current-installation.ts";
import { requireAppActor } from "./actor.ts";
import { AppRegistryServiceError } from "./service-error.ts";

/** Re-resolved metadata only. A later dispatcher must authorize again and obtain its actual execution lease. */
export async function resolveAppOperation(ports: { store: AppRegistryStore; authority: AppRegistryAuthority; checkTarget: AppRegistryTargetCheck; now(): number }, context: unknown, input: unknown, expected?: AppOperationResolutionV1): Promise<AppOperationResolutionV1> {
  const invocation = parseAppInvocation(input);
  if (!invocation.ok) throw new AppRegistryServiceError("invalid_request");
  const expectedSnapshot = expected === undefined ? undefined : parseAppOperationResolution(expected);
  if (expectedSnapshot && !expectedSnapshot.ok) throw new AppRegistryServiceError("invalid_request");
  const { installation, manifest } = await currentAppInstallation(ports.store, invocation.value.installationId);
  if (installation.status !== "active") throw new AppRegistryServiceError("unavailable");
  const operation = manifest.operations.find((candidate) => candidate.id === invocation.value.operationId);
  if (!operation) throw new AppRegistryServiceError("unavailable");
  const request = { installation, manifest, operation };
  const actor = checkedActor(await ports.authority.operation(context, structuredClone(request)), request, ports.now());
  if (!validateAppOperationInputs(operation, invocation.value.inputs).ok) throw new AppRegistryServiceError("invalid_request");
  if (!await ports.checkTarget({ ...structuredClone(request), actor: structuredClone(actor) })) throw new AppRegistryServiceError("target_unavailable");
  const finalActor = checkedActor(await ports.authority.operation(context, structuredClone(request)), request, ports.now(), actor);
  const latest = await ports.store.getInstallation(installation.installationId);
  if (!isDeepStrictEqual(latest, installation)) throw new AppRegistryServiceError("stale_resolution");
  requireAppActor(finalActor, ports.now(), actor);
  const resolution: AppOperationResolutionV1 = {
    schemaVersion: 1, kind: "operation-resolution", installationId: installation.installationId, operationId: operation.id, operationKind: operation.kind,
    manifestDigest: manifest.manifestDigest, generation: installation.generation, revision: installation.revision,
    binding: structuredClone(operation.binding), target: structuredClone(installation.target),
    payer: operation.kind === "query" ? { kind: "no-managed-compute-charge" } : structuredClone(installation.payer),
    requiredGrants: structuredClone(operation.requestedGrants)
  };
  const parsed = parseAppOperationResolution(resolution);
  if (!parsed.ok) throw new AppRegistryServiceError("unavailable");
  if (expectedSnapshot?.ok && !isDeepStrictEqual(expectedSnapshot.value, parsed.value)) throw new AppRegistryServiceError("stale_resolution");
  return parsed.value;
}

function checkedActor(value: AppOperationActor | null, request: { installation: AppInstallationV1; manifest: AppManifestV1; operation: AppOperation }, now: number, expected?: AppOperationActor): AppOperationActor {
  const actor = requireAppActor(value, now, expected);
  const { installation, manifest, operation } = request;
  const delegation = value?.delegation;
  if (actor.workspaceId !== installation.workspaceId || !delegation || delegation.publisherId !== installation.app.publisherId || delegation.appId !== installation.app.appId || delegation.installationId !== installation.installationId || delegation.generation !== installation.generation || !manifest.frontend.allowedOrigins.includes(delegation.origin) || !Array.isArray(delegation.grants)) throw new AppRegistryServiceError("forbidden");
  if (delegation.grants.some((grant) => !installation.approvedGrants.some((approved) => appGrantCovers(approved, grant))) || operation.requestedGrants.some((grant) => !installation.approvedGrants.some((approved) => appGrantCovers(approved, grant)) || !delegation.grants.some((approved) => appGrantCovers(approved, grant)))) throw new AppRegistryServiceError("forbidden");
  if (expected && expected.delegation.origin !== delegation.origin) throw new AppRegistryServiceError("forbidden");
  return { ...actor, delegation: structuredClone(delegation) };
}
