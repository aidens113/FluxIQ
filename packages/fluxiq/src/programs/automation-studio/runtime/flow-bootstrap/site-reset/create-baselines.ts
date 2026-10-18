import type { AutomationStudioSiteResetDeclared, AutomationStudioSiteResetRead } from "./contracts.ts";
import { automationStudioSiteResetInvalidCollectionGroups } from "./collection-groups.ts";

/** Immutable, build-only original inventory receipts. A receipt never grants undo permission. */
export class AutomationStudioSiteResetCreateBaselines {
  private readonly originals = new Map<string, { ref: string; resource: string; group: string; subjects: ReadonlySet<string> }>();
  private readonly groups = new Map<string, ReadonlySet<string>>();
  private readonly groupResources = new Map<string, string>();
  private readonly pages = new Map<string, Set<string>>();
  private readonly valid = new Map<string, boolean>();
  private readonly issued = new Set<string>();
  private current: Array<{ ref: string; ordinal: number; count: number }> = [];
  private sealed = false;

  /** Once any known lasting project act lands, a first observation cannot become original authority. */
  seal(): void { this.sealed = true; }

  observed(read: AutomationStudioSiteResetRead, original = true): void {
    this.current = [];
    const collections = read.collections ?? [];
    const invalid = automationStudioSiteResetInvalidCollectionGroups(collections);
    const resource = read.resource;
    const trustedResource = typeof resource === "string" && /^[A-Za-z0-9:_-]{1,128}$/u.test(resource);
    const grouped = new Map<string, Set<string>>();
    for (const collection of collections) {
      const scopes = grouped.get(collection.group) ?? new Set<string>();
      scopes.add(collection.scope);
      grouped.set(collection.group, scopes);
    }
    // A strict parser can omit an entirely malformed inventory. An observed
    // page that formerly proved these groups must not retain stale admission.
    const page = trustedResource && read.scope !== undefined ? `${resource}\0${read.scope}` : undefined;
    for (const group of (page === undefined ? undefined : this.pages.get(page)) ?? []) if (!grouped.has(group)) this.valid.set(group, false);
    for (const [group, scopes] of grouped) {
      if (this.groupResources.has(group) && this.groupResources.get(group) !== resource) continue;
      const before = this.groups.get(group);
      const sameResource = [...scopes].every(scope => !this.originals.has(scope) || this.originals.get(scope)!.resource === resource);
      const capacity = [...scopes].filter(scope => !this.originals.has(scope)).length + this.originals.size <= 256;
      this.valid.set(group, !invalid.has(group) && trustedResource && sameResource && capacity && (!before || (scopes.size === before.size && [...before].every(scope => scopes.has(scope)))));
    }
    if (!trustedResource) return;
    for (const [index, collection] of collections.entries()) {
      if (!this.valid.get(collection.group) || (this.groupResources.has(collection.group) && this.groupResources.get(collection.group) !== resource)) continue;
      let before = this.originals.get(collection.scope);
      if (!before && original && !this.sealed && this.originals.size < 256) {
        before = { ref: `destination-${this.originals.size + 1}`, resource, group: collection.group, subjects: new Set(collection.subjects) };
        this.originals.set(collection.scope, before);
        if (!this.groups.has(collection.group)) {
          this.groups.set(collection.group, new Set(grouped.get(collection.group)));
          this.groupResources.set(collection.group, resource);
        }
        if (page !== undefined) {
          const groups = this.pages.get(page) ?? new Set<string>();
          groups.add(collection.group);
          this.pages.set(page, groups);
        }
      }
      if (before?.resource === resource && before.group === collection.group && this.current.length < 32) this.current.push({ ref: before.ref, ordinal: index + 1, count: before.subjects.size });
    }
  }

  /** Only refs associated with the actual latest observation, never raw identities or inventory values. */
  receipts(): Array<{ ref: string; ordinal: number; count: number }> {
    for (const receipt of this.current) this.issued.add(receipt.ref);
    return this.current.map(receipt => ({ ...receipt }));
  }

  check(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown): { kind: "admit" } | { kind: "refused"; evidence: { ok: false; code: string; instruction: string } } {
    const { control, consequences } = declared;
    // This necessary precondition is not a classifier for inventory semantics.
    // Irreversible/mixed and unidentified operations keep their existing policy.
    const subjects = [...new Set([control.subject, ...(control.item === undefined ? [control.page] : [])].filter((subject): subject is string => subject !== undefined))];
    if (declared.effect !== "mutate" || consequences.length !== 1 || consequences[0] !== "create_new" || subjects.length === 0) return { kind: "admit" };
    const original = reference === undefined ? (control.scope === undefined ? undefined : this.originals.get(control.scope)) : typeof reference === "string" && this.issued.has(reference) ? [...this.originals.values()].find(entry => entry.ref === reference) : undefined;
    if (control.resource !== undefined && original?.resource === control.resource && this.valid.get(original.group) === true && subjects.every(subject => !original.subjects.has(subject))) return { kind: "admit" };
    return { kind: "refused", evidence: { ok: false, code: "candidate.create_baseline_required", instruction: "This creation was not run. Before creating an identified reversible effect, observe its destination's complete original inventory through the site's own controls, then return and retry with the resetDestination reference that observation issued. The original inventory must belong to this resource and prove the subject absent. A first observation after a lasting build effect, another resource, a matching name, or an invented reference is insufficient. Looking and navigating remain available; no new permission is needed." } };
  }
}
