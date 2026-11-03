// The build's original list receipts (F1), and the original half of the one admission's port (t751, R1/R3).
//
// A complete read of a list group becomes its original, and issues refs the model may name as resetDestination, unless an
// act of the build already counts that group among its witnesses (`touch`, the per-group seal) or an act whose effect
// location is unknown is on the site (`seal`, which still seals every group). Originals are immutable once recorded.
// Whether a press may land is decided by `../reset-admission/` alone; `check` is its exploration door.
//
// **A page read whole (t791).** A read that carries no complete list, names its page and reports the subjects it shows
// (possibly none: an empty state) is a reading of that whole page (`./page-collection.ts`), and its first such read becomes
// a page original with a `destination-N` ref of its own, printed with `page: true`. Once the page has an original, every
// read of it carries the page as one of its lists (`paged`), lists or not, so it stays read. A page original witnesses only
// an identified creation that names its ref, of its own resource, with the creation's subject absent from it: what the page
// shows grows by the made item. A page holds far more than one act's item, so it witnesses nothing else, and it is never a
// control's own list. Page originals are bounded apart from lists, so pages read never take a list's room.

import { AutomationStudioSiteResetStepResources, automationStudioSiteResetAdmission as admission, automationStudioSiteResetIdentifiedCreate as identifiedCreate, type AutomationStudioSiteResetAdmissionDeclared, type AutomationStudioSiteResetAdmissionExplored, type AutomationStudioSiteResetAdmissionKnown } from "../reset-admission/index.ts";
import { automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetDeclared, AutomationStudioSiteResetRead } from "./contracts.ts";
import { automationStudioSiteResetInvalidCollectionGroups } from "../reset-settlement/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";
import { automationStudioSiteResetPageCollection as pageCollection } from "./page-collection.ts";

/** The classes the site's own controls can reverse: the acts that may name a destination (F1). */
const REVERSIBLE: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);
/** The most list originals kept, as before. */
const LIST_CAP = 256;
/** The most page originals kept (header), apart from lists; with them refs stay within the three digits a stamp takes. */
const PAGE_CAP = 512;

/** One receipt as the model is shown it: `page` marks a page read whole (header). */
type Receipt = { ref: string; ordinal: number; count: number; page?: true };

/** Immutable, build-only original inventory receipts. A receipt never grants undo permission. */
export class AutomationStudioSiteResetCreateBaselines {
  private readonly originals = new Map<string, { ref: string; resource: string; group: string; subjects: ReadonlySet<string>; location?: string; page?: true }>();
  private readonly groups = new Map<string, ReadonlySet<string>>();
  private readonly groupResources = new Map<string, string>();
  private readonly pages = new Map<string, Set<string>>();
  private readonly valid = new Map<string, boolean>();
  private readonly issued = new Set<string>();
  private current: Receipt[] = [];
  /** How many list and page originals are kept (header). */
  private listOriginals = 0;
  private pageOriginals = 0;
  private sealed = false;
  /** The tab each plan step acts in, as the step door saw it (`../reset-admission/step-resources.ts`, t791 fix 2). */
  readonly steps = new AutomationStudioSiteResetStepResources();
  /** Groups an act of the build already counts among its witnesses: no first read of them becomes original (R1). */
  private readonly touched = new Set<string>();

  /** Once a lasting act whose effect location is unknown lands, no first observation of any group can become original authority. */
  seal(): void { this.sealed = true; }

  /** Groups whose first act landed (R1, the per-group seal): a first read of one of them never becomes an original. */
  touch(groups: Iterable<string>): void {
    for (const group of groups) this.touched.add(group);
  }

  /** Whether no further read can become an original: an act whose effect place is unknown sealed the build (`seal`). */
  isSealed(): boolean {
    return this.sealed;
  }

  /** Whether a first read of `group` can no longer become an original: an act touched it, or the whole build is sealed (header). */
  closed(group: string): boolean {
    return this.sealed || this.touched.has(group);
  }

  /**
   * `read` with its page read whole among its lists (header): where it carries no list and its page can be read whole, or
   * where that page already has an original, so a later read of it keeps reading it. Otherwise, or where the page is
   * already among its lists, `read` itself. Every ledger reading this build's originals asks it first.
   */
  paged(read: AutomationStudioSiteResetRead): AutomationStudioSiteResetRead {
    const page = pageCollection(read);
    const lists = read.collections ?? [];
    if (!page || lists.some((collection) => collection.scope === page.scope) || (lists.length > 0 && !this.originals.has(page.scope))) return read;
    return { ...read, collections: [...lists, page] };
  }

  observed(given: AutomationStudioSiteResetRead, original = true): void {
    this.current = [];
    // The page read whole among the lists, where `paged` puts it (header); a read a ledger already paged is the same read.
    const read = this.paged(given);
    const collections = read.collections ?? [];
    const invalid = automationStudioSiteResetInvalidCollectionGroups(collections);
    const pageScope = pageCollection(read)?.scope;
    const isPage = (scope: string): boolean => scope === pageScope;
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
      const whole = [...scopes].some(isPage);
      const capacity = [...scopes].filter(scope => !this.originals.has(scope)).length + (whole ? this.pageOriginals : this.listOriginals) <= (whole ? PAGE_CAP : LIST_CAP);
      this.valid.set(group, !invalid.has(group) && trustedResource && sameResource && capacity && (!before || (scopes.size === before.size && [...before].every(scope => scopes.has(scope)))));
    }
    if (!trustedResource) return;
    for (const [index, collection] of collections.entries()) {
      if (!this.valid.get(collection.group) || (this.groupResources.has(collection.group) && this.groupResources.get(collection.group) !== resource)) continue;
      let before = this.originals.get(collection.scope);
      const whole = isPage(collection.scope);
      if (!before && original && !this.closed(collection.group) && (whole ? this.pageOriginals < PAGE_CAP : this.listOriginals < LIST_CAP)) {
        before = { ref: `destination-${this.originals.size + 1}`, resource, group: collection.group, subjects: new Set(collection.subjects), ...(read.location ? { location: read.location } : {}), ...(whole ? { page: true as const } : {}) };
        this.originals.set(collection.scope, before);
        if (whole) this.pageOriginals += 1;
        else this.listOriginals += 1;
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
      if (before?.resource === resource && before.group === collection.group && this.current.length < 32) this.current.push({ ref: before.ref, ordinal: index + 1, count: before.subjects.size, ...(before.page ? { page: true as const } : {}) });
    }
  }

  /** Only refs associated with the actual latest observation, never raw identities or inventory values; a page read whole says `page` (header). */
  receipts(): Receipt[] {
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
    return this.retained(reference);
  }

  /** Core-derived step stamps may name an original directly; this never issues a ref or admits a model's resetDestination. */
  retained(reference: unknown): { scope: string; group: string } | undefined {
    if (typeof reference !== "string") return undefined;
    const found = [...this.originals].find(([, entry]) => entry.ref === reference);
    if (!found || this.valid.get(found[1].group) !== true) return undefined;
    return { scope: found[0], group: found[1].group };
  }

  /** A list scope's original as the model may be told it: its ref, how many items it held, and where it was read. */
  described(scope: string): { ref: string; count: number; location?: string } | undefined {
    const original = this.originals.get(scope);
    return original ? { ref: original.ref, count: original.subjects.size, ...(original.location ? { location: original.location } : {}) } : undefined;
  }

  /** Resource provenance for a retained original, used only to bound unknown control locations within that resource. */
  resourceOf(scope: string): string | undefined { return this.originals.get(scope)?.resource; }

  /** Every ref the model was shown, in order, with its count and where it was read (L1: what an act with no witness can name). */
  issuedRefs(): Array<{ ref: string; count: number; location?: string }> {
    return [...this.originals.values()].filter((entry) => this.issued.has(entry.ref)).map((entry) => ({ ref: entry.ref, count: entry.subjects.size, ...(entry.location ? { location: entry.location } : {}) }));
  }

  /**
   * The refs shown that were read in `resource` (a tab) only (t791 fix 2): a ref read in another tab can never witness a press
   * in this one, so none is ever offered for it. None for an unknown resource.
   */
  issuedRefsIn(resource: string | undefined): Array<{ ref: string; count: number; location?: string }> {
    if (resource === undefined) return [];
    return [...this.originals.values()].filter((entry) => this.issued.has(entry.ref) && entry.resource === resource).map((entry) => ({ ref: entry.ref, count: entry.subjects.size, ...(entry.location ? { location: entry.location } : {}) }));
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

  /**
   * The exploration door of the one admission (`../reset-admission/admission.ts`, t751): asked of every action before it
   * runs, after any earlier lasting act as before one. `explored`: the build's explored acts an action may repeat (absent,
   * none). Admitted, it answers exactly `{ kind: "admit" }`, as before: the witness is the admission's to hand a caller that
   * keeps it. A refusal records nothing and seals nothing.
   */
  check(declared: AutomationStudioSiteResetAdmissionDeclared, reference: unknown, explored: () => ReadonlyArray<AutomationStudioSiteResetAdmissionExplored> = () => []): { kind: "admit" } | { kind: "refused"; evidence: { ok: false; code: string; instruction: string } } {
    const verdict = admission({ declared, reference, door: "exploration" }, { ...this.known(), explored });
    return verdict.kind === "admit" ? { kind: "admit" } : verdict;
  }

  /** Its part of the admission's port (`../reset-admission/contracts.ts`): every part but the explored acts, which the caller's ledger supplies. */
  known(): Omit<AutomationStudioSiteResetAdmissionKnown, "explored"> {
    return {
      unissued: (reference) => reference !== undefined && !(typeof reference === "string" && this.issued.has(reference)),
      destination: (declared, reference) => {
        const found = this.destination(declared, reference);
        const ref = found ? this.originals.get(found.scope)?.ref : undefined;
        return found && ref !== undefined ? { ref, ...found } : undefined;
      },
      original: (scope, resource) => (this.original(scope, resource) ? { scope, group: this.originals.get(scope)!.group } : undefined),
      issuedRefs: () => this.issuedRefs(),
      issuedRefsIn: (resource) => this.issuedRefsIn(resource),
      sealed: () => this.sealed,
      here: () => this.current.map((receipt) => receipt.ref)
    };
  }

  /** Whether `scope` is a recorded original of `resource` in a group still valid: a control there sits in a list read complete (the `own_list` witness). */
  private original(scope: string, resource: string): boolean {
    const original = this.originals.get(scope);
    return original !== undefined && original.resource === resource && this.valid.get(original.group) === true;
  }

  /**
   * Where a reversible act's effect would show, as an original of this resource
   * (F1): an identified creation's by its issued ref or its own scope, with its
   * subject absent there -- none where the admission would refuse it -- and any other
   * reversible act's only by an issued ref the call named. A page read whole is
   * where only an identified creation's effect shows (header, t791). The ledger
   * keeps it on the act; it proves nothing until read again after the act.
   */
  destination(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown): { scope: string; group: string } | undefined {
    const { control, consequences } = declared;
    if (declared.effect !== "mutate" || consequences.length === 0 || !consequences.every(consequence => REVERSIBLE.has(consequence))) return undefined;
    const created = identifiedCreate(declared);
    const scope = reference === undefined ? (created ? control.scope : undefined) : typeof reference === "string" && this.issued.has(reference) ? [...this.originals].find(([, entry]) => entry.ref === reference)?.[0] : undefined;
    const original = scope === undefined ? undefined : this.originals.get(scope);
    if (scope === undefined || !original || (original.page && !created) || control.resource === undefined || original.resource !== control.resource || this.valid.get(original.group) !== true || (created ?? []).some(subject => original.subjects.has(subject))) return undefined;
    return { scope, group: original.group };
  }
}
