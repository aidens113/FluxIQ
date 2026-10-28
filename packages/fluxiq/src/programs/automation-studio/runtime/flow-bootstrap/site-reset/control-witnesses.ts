import type { AutomationStudioSiteResetRead, AutomationStudioSiteResetSpot } from "./contracts.ts";

const TOKEN = /^[A-Za-z0-9:_-]{1,128}$/u;

/** Trusted pre-act control evidence. Opaque identities stay inside Core; a plan carries only its receipt ref. */
export type AutomationStudioSiteResetControlOriginal = {
  resource: string; page: string; place: string; before: Readonly<Record<string, number>>; location?: string;
  /** A looped pass's own original (`./ledger.ts`, `stamped`): judged only on reads at this location, since items share place tokens. */
  at?: string;
};

/** Immutable control originals and receipts owned by one build, shared across its brief ledgers. */
export class AutomationStudioSiteResetControlWitnesses {
  private readonly originals = new Map<string, AutomationStudioSiteResetControlOriginal>();
  private readonly receipts = new Map<string, AutomationStudioSiteResetControlOriginal>();
  private readonly touched = new Set<string>();
  private readonly blockedResources = new Set<string>();
  private sealed = false;

  observed(read: AutomationStudioSiteResetRead): void {
    if (this.sealed || read.resource === undefined || !TOKEN.test(read.resource) || this.blockedResources.has(read.resource) || read.scope === undefined || !TOKEN.test(read.scope) || read.controls === undefined || Object.keys(read.controls).length > 2000) return;
    for (const [place, before] of Object.entries(read.controls)) {
      const states = Object.keys(before);
      if (!TOKEN.test(place) || !states.length || states.length > 256 || !states.every((state) => TOKEN.test(state)) || !Object.values(before).every((count) => Number.isSafeInteger(count) && count >= 0)) continue;
      const key = this.key(read.resource, place);
      if (this.originals.has(key) || this.touched.has(key) || this.originals.size >= 2000) continue;
      this.originals.set(key, { resource: read.resource, page: read.scope, place, before: { ...before }, ...(read.location ? { location: read.location } : {}) });
    }
  }

  /** A missing place cannot authorize a later first read as the build's original. */
  touchedAt(spot: AutomationStudioSiteResetSpot | undefined): void {
    if (spot?.resource === undefined) this.sealed = true;
    else if (spot.place === undefined) this.blockedResources.add(spot.resource);
    else this.touched.add(this.key(spot.resource, spot.place));
  }

  /** Issue only an original actually read before the build acted at this place, never the submission's current state. */
  proven(spot: AutomationStudioSiteResetSpot): boolean {
    const original = spot.resource !== undefined && spot.place !== undefined ? this.originals.get(this.key(spot.resource, spot.place)) : undefined;
    return original !== undefined && Object.values(original.before).some((count) => count > 0);
  }

  /**
   * A trial pass's own counts at its own place, read just before the build's first press there (`./trial-stamp.ts`): that
   * place's original, where no read or act of the build got there first. Only an original the build could still have read
   * (`canRead`) is filed, so a later read showing the pass's own press never becomes one, and a step on that control is
   * stamped by what the build found (t772 w9).
   */
  passed(original: AutomationStudioSiteResetControlOriginal): void {
    const states = Object.keys(original.before);
    if (!TOKEN.test(original.resource) || !TOKEN.test(original.page) || !TOKEN.test(original.place) || !states.length || states.length > 256 || !states.every((state) => TOKEN.test(state)) || !Object.values(original.before).every((count) => Number.isSafeInteger(count) && count >= 0)) return;
    if (!this.canRead({ resource: original.resource, place: original.place }) || this.originals.size >= 2000) return;
    this.originals.set(this.key(original.resource, original.place), { resource: original.resource, page: original.page, place: original.place, before: { ...original.before }, ...(original.location ? { location: original.location } : {}) });
  }

  canRead(spot: AutomationStudioSiteResetSpot): boolean {
    return spot.resource !== undefined && spot.place !== undefined && !this.sealed && !this.blockedResources.has(spot.resource) && !this.touched.has(this.key(spot.resource, spot.place)) && !this.originals.has(this.key(spot.resource, spot.place));
  }

  stamp(spot: AutomationStudioSiteResetSpot): { via: "control"; ref: string } | undefined {
    if (spot.resource === undefined || spot.place === undefined) return undefined;
    const original = this.originals.get(this.key(spot.resource, spot.place));
    if (!original || !this.proven(spot)) return undefined;
    const existing = [...this.receipts].find(([, value]) => value === original)?.[0];
    if (existing) return { via: "control", ref: existing };
    if (this.receipts.size >= 256) return undefined;
    const ref = `control-${this.receipts.size + 1}`;
    this.receipts.set(ref, original);
    return { via: "control", ref };
  }

  resolve(reference: unknown): AutomationStudioSiteResetControlOriginal | undefined {
    const original = typeof reference === "string" ? this.receipts.get(reference) : undefined;
    return original ? structuredClone(original) : undefined;
  }

  private key(resource: string, place: string): string { return `${resource}\0${place}`; }
}
