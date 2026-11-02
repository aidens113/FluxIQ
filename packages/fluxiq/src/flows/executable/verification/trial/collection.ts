import type { SiteResetCollection } from "./source-collection.ts";

/**
 * One complete list group's collection as a trial reads it. A page read whole (t791,
 * `../site-reset/page-collection.ts`: every subject one read of a page reports, as one list Core makes of it, which an
 * empty page reads as holding nothing) also carries `values`, an opaque digest of every value that page shows (t772), so
 * a quantity the page shows changing is a change of that page (`./delta.ts`). A list the domain read carries none.
 */

export type TrialCollection = SiteResetCollection & { values?: string };
