import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, vi } from "vitest";
import type { AppGrant, AppManifestV1, AppOperation } from "@fluxiq/contracts/apps";
import type { AppAuthorityActor, AppInstallProposal, AppOperationActor, AppPublicationActor, AppRegistryAuthority, AppRegistryTargetCheck } from "../../model/index.ts";
import { SQLiteAppRegistryStore } from "../../storage/index.ts";
import { appInstallationFixture, appManifestFixture } from "../../tests/fixtures/index.ts";
import { createAppRegistryService } from "../index.ts";

const prefix = "fluxiq-app-service-";
const roots: string[] = [];
const stores: SQLiteAppRegistryStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith(prefix)) throw new Error("Refusing cleanup outside the test temporary root.");
    await rm(root, { recursive: true, force: true });
  }
});

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}

export function appProposal(manifest: AppManifestV1): AppInstallProposal {
  const { app, approvedGrants, target, payer } = appInstallationFixture(manifest);
  return { app, approvedGrants, target, payer };
}

export async function serviceFixture(inputManifest?: AppManifestV1) {
  const manifest = inputManifest ?? await appManifestFixture();
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(rootDir);
  const store = new SQLiteAppRegistryStore({ rootDir });
  stores.push(store);
  const context = Object.freeze({ adapterRequest: "authenticated-request" });
  const actor: AppAuthorityActor = { userId: "user.one", workspaceId: "workspace.one", expiresAtMs: 10_000 };
  const operationActor: AppOperationActor = {
    ...actor,
    delegation: { publisherId: manifest.publisherId, appId: manifest.appId, installationId: "installation.one", generation: 1, origin: manifest.frontend.allowedOrigins[0]!, grants: structuredClone(manifest.requestedGrants) }
  };
  const state: { actor: AppAuthorityActor | null; publication: AppPublicationActor | null; operation: AppOperationActor | null; now: number; target: AppRegistryTargetCheck } = {
    actor, publication: { userId: actor.userId, publisherId: manifest.publisherId, expiresAtMs: actor.expiresAtMs }, operation: operationActor, now: 1_000, target: async () => true
  };
  const authority = {
    publication: vi.fn<AppRegistryAuthority["publication"]>(async received => received === context ? structuredClone(state.publication) : null),
    installation: vi.fn<AppRegistryAuthority["installation"]>(async received => received === context ? structuredClone(state.actor) : null),
    revocation: vi.fn<AppRegistryAuthority["revocation"]>(async received => received === context ? structuredClone(state.actor) : null),
    operation: vi.fn<AppRegistryAuthority["operation"]>(async received => received === context ? structuredClone(state.operation) : null)
  };
  const checkTarget = vi.fn<AppRegistryTargetCheck>(request => state.target(request));
  const service = createAppRegistryService({ store, authority, checkTarget, now: () => state.now, newInstallationId: () => "installation.one" });
  await service.registerManifest(context, manifest);
  return { rootDir, store, context, manifest, state, authority, checkTarget, service, proposal: appProposal(manifest), invocation: { schemaVersion: 1, installationId: "installation.one", operationId: "read-orders", inputs: { limit: 3 }, idempotencyKey: "request.one" } };
}

export async function executionManifest() {
  const query = (await appManifestFixture()).operations[0]!;
  const grants: AppGrant[] = [{ capability: "automation.execute", bindingId: "flow:fulfill", acts: ["change"] }];
  const operation: AppOperation = { id: "fulfill", kind: "execution", inputs: { type: "string", minLength: 1 }, result: { type: "boolean" }, binding: { kind: "flow", id: "flow:fulfill", definitionDigest: "b".repeat(64) }, requestedGrants: grants };
  return appManifestFixture({ operations: [query, operation], requestedGrants: [...query.requestedGrants, ...grants], requirements: { runtimes: ["flow"], environments: ["local", "self-hosted", "cloud"], callbacks: [] } });
}
