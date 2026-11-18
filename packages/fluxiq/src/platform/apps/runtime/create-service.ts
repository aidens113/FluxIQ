import { randomUUID } from "node:crypto";
import type { AppRegistryAuthority, AppRegistryService, AppRegistryStore, AppRegistryTargetCheck } from "../model/index.ts";
import { appRegistryBoundary } from "./boundary.ts";
import { AppRegistryMutations } from "./mutations.ts";
import { resolveAppOperation } from "./resolve-operation.ts";
import { AppRegistryServiceError } from "./service-error.ts";

export function createAppRegistryService(input: { store: AppRegistryStore; authority: AppRegistryAuthority; checkTarget: AppRegistryTargetCheck; now?: () => number; newInstallationId?: () => string }): AppRegistryService {
  if (!input.store || !input.authority || [input.authority.publication, input.authority.installation, input.authority.revocation, input.authority.operation, input.checkTarget].some((port) => typeof port !== "function")) throw new AppRegistryServiceError("unavailable");
  const now = input.now ?? Date.now;
  const ports = { store: input.store, authority: input.authority, checkTarget: input.checkTarget, now };
  const mutations = new AppRegistryMutations({ ...ports, newInstallationId: input.newInstallationId ?? (() => `app-installation:${randomUUID()}`) });
  return {
    registerManifest: (context, manifest) => appRegistryBoundary(() => mutations.registerManifest(context, manifest)),
    install: (context, proposal) => appRegistryBoundary(() => mutations.install(context, proposal)),
    update: (context, request) => appRegistryBoundary(() => mutations.update(context, request)),
    revoke: (context, id) => appRegistryBoundary(() => mutations.revoke(context, id)),
    resolveOperation: (context, invocation, expected) => appRegistryBoundary(() => resolveAppOperation(ports, context, invocation, expected))
  };
}
