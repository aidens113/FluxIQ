import { validateAppInstallationAgainstManifest, verifyAppManifest, type AppInstallationV1, type AppManifestV1 } from "@fluxiq/contracts/apps";
import type { AppPublicationActor, AppRegistryAuthority, AppRegistryStore } from "../model/index.ts";
import { requireAppActor } from "./actor.ts";
import { matchesAppActor } from "./matches-actor.ts";
import { appInstallProposal } from "./proposal.ts";
import { currentAppInstallation } from "./current-installation.ts";
import { AppRegistryServiceError } from "./service-error.ts";

/** Explicit authorized configuration writes; neither installation nor an upgrade dispatches work. */
export class AppRegistryMutations {
  constructor(private readonly ports: { store: AppRegistryStore; authority: AppRegistryAuthority; now(): number; newInstallationId(): string }) {}

  async registerManifest(context: unknown, input: unknown): Promise<AppManifestV1> {
    const parsed = await verifyAppManifest(structuredClone(input));
    if (!parsed.ok) throw new AppRegistryServiceError("invalid_request");
    const manifest = parsed.value;
    const granted = await this.ports.authority.publication(context, structuredClone(manifest));
    if (!publicationActor(granted, manifest.publisherId, this.ports.now())) throw new AppRegistryServiceError("forbidden");
    const actor = { ...granted! };
    await this.ports.store.registerManifest(manifest, async () => {
      const current = await this.ports.authority.publication(context, structuredClone(manifest));
      return publicationActor(current, manifest.publisherId, this.ports.now()) && current!.userId === actor.userId;
    });
    return manifest;
  }

  async install(context: unknown, input: unknown): Promise<AppInstallationV1> {
    const proposal = appInstallProposal(input);
    const checked = await verifyAppManifest(await this.ports.store.getManifest(proposal.app));
    if (!checked.ok) throw new AppRegistryServiceError("unavailable");
    const request = { manifest: checked.value, proposal, previous: null };
    const actor = requireAppActor(await this.ports.authority.installation(context, structuredClone(request)), this.ports.now());
    const now = this.ports.now();
    const candidate: AppInstallationV1 = { ...proposal, schemaVersion: 1, installationId: this.ports.newInstallationId(), workspaceId: actor.workspaceId, installedByUserId: actor.userId, installedAtMs: now, updatedAtMs: now, revision: 1, generation: 1, status: "active" };
    const parsed = validateAppInstallationAgainstManifest(candidate, checked.value);
    if (!parsed.ok) throw new AppRegistryServiceError("invalid_request");
    const created = await this.ports.store.createInstallation(parsed.value, actor.userId, async () => matchesAppActor(await this.ports.authority.installation(context, structuredClone(request)), actor, this.ports.now()));
    if (!created) throw new AppRegistryServiceError("conflict");
    return parsed.value;
  }

  async update(context: unknown, input: { installationId: string; expectedRevision: number; proposal: unknown }): Promise<AppInstallationV1> {
    const installationId = input.installationId;
    const expectedRevision = input.expectedRevision;
    const proposal = appInstallProposal(input.proposal);
    const { installation: previous } = await currentAppInstallation(this.ports.store, installationId);
    if (previous.status !== "active" || previous.revision !== expectedRevision) throw new AppRegistryServiceError("conflict");
    const checked = await verifyAppManifest(await this.ports.store.getManifest(proposal.app));
    if (!checked.ok) throw new AppRegistryServiceError("unavailable");
    const request = { manifest: checked.value, proposal, previous };
    const actor = requireAppActor(await this.ports.authority.installation(context, structuredClone(request)), this.ports.now());
    if (actor.workspaceId !== previous.workspaceId) throw new AppRegistryServiceError("forbidden");
    const candidate: AppInstallationV1 = { ...previous, ...proposal, updatedAtMs: this.ports.now(), revision: previous.revision + 1, generation: previous.generation + 1 };
    const parsed = validateAppInstallationAgainstManifest(candidate, checked.value);
    if (!parsed.ok) throw new AppRegistryServiceError("invalid_request");
    const changed = await this.ports.store.replaceInstallation(parsed.value, expectedRevision, actor.userId, async () => matchesAppActor(await this.ports.authority.installation(context, structuredClone(request)), actor, this.ports.now()));
    if (!changed) throw new AppRegistryServiceError("conflict");
    return parsed.value;
  }

  async revoke(context: unknown, installationId: string): Promise<AppInstallationV1> {
    const { installation } = await currentAppInstallation(this.ports.store, installationId);
    const actor = requireAppActor(await this.ports.authority.revocation(context, structuredClone(installation)), this.ports.now());
    if (actor.workspaceId !== installation.workspaceId) throw new AppRegistryServiceError("forbidden");
    if (installation.status === "revoked") return installation;
    const now = this.ports.now();
    const next: AppInstallationV1 = { ...installation, status: "revoked", revokedAtMs: now, updatedAtMs: now, revision: installation.revision + 1, generation: installation.generation + 1 };
    const changed = await this.ports.store.replaceInstallation(next, installation.revision, actor.userId, async () => matchesAppActor(await this.ports.authority.revocation(context, structuredClone(installation)), actor, this.ports.now()));
    if (!changed) throw new AppRegistryServiceError("conflict");
    return next;
  }
}

function publicationActor(actor: AppPublicationActor | null, publisherId: string, now: number): boolean {
  return !!actor && typeof actor.userId === "string" && actor.userId.length > 0 && actor.publisherId === publisherId && Number.isFinite(actor.expiresAtMs) && actor.expiresAtMs > now;
}
