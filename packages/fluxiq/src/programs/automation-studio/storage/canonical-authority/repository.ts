import type { JsonObject } from "../../../../core/index.ts";
import type { CanonicalAuthorityKind, CanonicalAuthorityOptions } from "./contracts.ts";
import { CanonicalAuthorityOwnerStore } from "./owner-store.ts";
import { CanonicalAuthorityProjectCoordinator } from "./project-coordinator.ts";
import { CanonicalAuthorityValidation as V } from "./validation.ts";

/** Private factory collaborator; plain put cannot allocate or supply claim authority. */
export class CanonicalAuthorityRepository {
  private readonly owners: CanonicalAuthorityOwnerStore;
  private readonly options: CanonicalAuthorityOptions | undefined;
  constructor(rootDir: string, private readonly kind: CanonicalAuthorityKind, options?: CanonicalAuthorityOptions) { V.kind(kind); this.owners = new CanonicalAuthorityOwnerStore(rootDir); this.options = options ? V.options(options) : undefined; }
  async route(method: "put" | "delete", id: string, document: JsonObject | null, domainId?: string | null): Promise<boolean> {
    if (this.options) V.id(id); const frozen = this.options ? V.clone(document) : structuredClone(document);
    if (this.options) await this.owners.installRouting();
    const legacyResult = await this.owners.tryLegacyMutation(this.kind, id, method, frozen, domainId);
    if (legacyResult !== null) return legacyResult;
    if (!this.options) throw new Error("canonical_authority.coordinator_required");
    const coordinator = new CanonicalAuthorityProjectCoordinator(this.owners, this.options);
    await coordinator.mutate(this.kind, id, method, frozen, method === "delete" ? domainId : undefined);
    return true;
  }
}
