import { automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetDeclared, AutomationStudioSiteResetRead } from "./contracts.ts";
import { automationStudioSiteResetInvalidCollectionGroups } from "../reset-settlement/index.ts";
import { automationStudioSiteResetWitnessMissing as witnessMissing } from "./reset-witness.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes the site's own controls can reverse: the acts that may name a destination (F1). */
const REVERSIBLE: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** Immutable, build-only original inventory receipts. A receipt never grants undo permission. */
export class AutomationStudioSiteResetCreateBaselines {
  private readonly originals = new Map<string, { ref: string; resource: string; group: string; subjects: ReadonlySet<string>; location?: string }>();
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
        before = { ref: `destination-${this.originals.size + 1}`, resource, group: collection.group, subjects: new Set(collection.subjects), ...(read.location ? { location: read.location } : {}) };
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

  /**
   * The original an issued ref names, for a look that names an act under
   * `undoes` (L1): resolved without the act's resource, since a trial's act
   * carries none (office checkout r2, `run-mvfq94ff-c8c21493`, 0151). Only a
   * ref the model was shown, of a group still valid; it proves nothing until
   * that list is read again after the act.
   */
  named(reference: unknown): { scope: string; group: string } | undefined {
    if (typeof reference !== "string" || !this.issued.has(reference)) return undefined;
    const found = [...this.originals].find(([, entry]) => entry.ref === reference);
    if (!found || this.valid.get(found[1].group) !== true) return undefined;
    return { scope: found[0], group: found[1].group };
  }

  /** A list scope's original as the model may be told it: its ref, how many items it held, and where it was read. */
  described(scope: string): { ref: string; count: number; location?: string } | undefined {
    const original = this.originals.get(scope);
    return original ? { ref: original.ref, count: original.subjects.size, ...(original.location ? { location: original.location } : {}) } : undefined;
  }

  /** Every ref the model was shown, in order, with its count and where it was read (L1: what an act with no witness can name). */
  issuedRefs(): Array<{ ref: string; count: number; location?: string }> {
    return [...this.originals.values()].filter((entry) => this.issued.has(entry.ref)).map((entry) => ({ ref: entry.ref, count: entry.subjects.size, ...(entry.location ? { location: entry.location } : {}) }));
  }

  /**
   * The refusal for a `resetDestination` naming a ref no receipt printed
   * (present, and never issued), or none (rerun round 2, job steps 0105/0107:
   * an invented ref was silently ignored). Refused before the call runs, on a
   * press here (`check`) and on a call under `undoes` (`./ledger.ts`, `claim`).
   */
  unissued(reference: unknown): { ok: false; code: string; instruction: string } | undefined {
    if (reference === undefined || (typeof reference === "string" && this.issued.has(reference))) return undefined;
    return refusal("candidate.reset_destination_unissued", { failed: "destination_unissued", canMeet: "this_page", instruction: WORDS.destinationUnissued() });
  }

  /** Whether no further ref can ever be issued: sealed, with every original already shown (rerun round 2, `./settlement-words.ts`). */
  refsClosed(): boolean {
    return this.sealed && [...this.originals.values()].every((entry) => this.issued.has(entry.ref));
  }

  /**
   * The builder's reset preconditions on one action, before it runs. An
   * identified creation needs its destination's original, as before. Any
   * other call naming a ref no receipt printed is refused (rerun round 2,
   * job steps 0105/0107). Before the seal, a reversible lasting press with no
   * witness is refused (`./reset-witness.ts`); after it, nothing more is
   * asked. A refusal records nothing and seals nothing.
   */
  check(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown): { kind: "admit" } | { kind: "refused"; evidence: { ok: false; code: string; instruction: string } } {
    // This necessary precondition is not a classifier for inventory semantics.
    // Irreversible/mixed and unidentified operations keep their existing policy.
    if (!identifiedCreate(declared)) {
      const unissued = this.unissued(reference);
      if (unissued) return { kind: "refused", evidence: unissued };
      const known = { original: (scope: string, resource: string) => this.original(scope, resource), destination: () => this.destination(declared, reference) !== undefined };
      if (this.sealed || !witnessMissing(declared, known)) return { kind: "admit" };
      return { kind: "refused", evidence: refusal("candidate.reset_witness_required", { failed: "no_witness", canMeet: "another_page", instruction: WORDS.witnessRequired(this.issuedRefs()) }) };
    }
    if (this.destination(declared, reference)) return { kind: "admit" };
    // Sealed with no original at all, no read can ever issue one (t743): no call meets it. Otherwise a complete read where it would show can.
    return { kind: "refused", evidence: refusal("candidate.create_baseline_required", { failed: "no_destination_original", canMeet: this.sealed && this.originals.size === 0 ? "no_call" : "another_page", instruction: WORDS.createBaselineRequired() }) };
  }

  /** Whether `scope` is a recorded original of `resource` in a group still valid: a control there sits in a list read complete (`./reset-witness.ts`). */
  private original(scope: string, resource: string): boolean {
    const original = this.originals.get(scope);
    return original !== undefined && original.resource === resource && this.valid.get(original.group) === true;
  }

  /**
   * Where a reversible act's effect would show, as an original of this resource
   * (F1): an identified creation's by its issued ref or its own scope, with its
   * subject absent there -- none where `check` would refuse it -- and any other
   * reversible act's only by an issued ref the call named. The ledger keeps it
   * on the act; it proves nothing until read again after the act.
   */
  destination(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown): { scope: string; group: string } | undefined {
    const { control, consequences } = declared;
    if (declared.effect !== "mutate" || consequences.length === 0 || !consequences.every(consequence => REVERSIBLE.has(consequence))) return undefined;
    const created = identifiedCreate(declared);
    const scope = reference === undefined ? (created ? control.scope : undefined) : typeof reference === "string" && this.issued.has(reference) ? [...this.originals].find(([, entry]) => entry.ref === reference)?.[0] : undefined;
    const original = scope === undefined ? undefined : this.originals.get(scope);
    if (scope === undefined || !original || control.resource === undefined || original.resource !== control.resource || this.valid.get(original.group) !== true || (created ?? []).some(subject => original.subjects.has(subject))) return undefined;
    return { scope, group: original.group };
  }
}

/** What an identified reversible creation is about, or none where the creation precondition does not apply. */
function identifiedCreate(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">): string[] | undefined {
  const { control, consequences } = declared;
  const subjects = [...new Set([control.subject, ...(control.item === undefined ? [control.page] : [])].filter((subject): subject is string => subject !== undefined))];
  return declared.effect !== "mutate" || consequences.length !== 1 || consequences[0] !== "create_new" || subjects.length === 0 ? undefined : subjects;
}
