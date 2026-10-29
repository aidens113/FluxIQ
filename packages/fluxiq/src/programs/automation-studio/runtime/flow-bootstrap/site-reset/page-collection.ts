// A page read whole, as one list Core makes of it (t791, crossborder adaptation
// gate `run-mvswhobv-5eb308c0` fix 1).
//
// A creation pressed on one page often shows its effect on another page of the
// same resource: an add made on an item's own page shows as a line on a
// collection page. A domain reports a list as a witness only where it can vouch
// for it as a list (`collections`), and many pages hold their items in plain
// blocks, or start as an empty state that holds no list at all. Such a creation
// had nothing that could ever witness it.
//
// Every read that names its page (`scope`) under a trusted resource and reports
// the subjects that page shows (`subjects`, possibly none) is also a reading of
// that whole page: the page is one list whose rows are those subjects. Core
// makes it here, with a scope and group of its own -- the read's resource and
// page scope behind a mark no domain token can carry (domain tokens are
// `[A-Za-z0-9:_-]`), so it never equals a list's or a control's scope, and a
// page read in one resource is never the same page read in another. Each row's
// value is one constant: a row is there or not. The values the page shows
// (t772) are one digest beside the rows (`values`), read only by a trial's delta
// (`../trial-change/delta.ts`), so a quantity the page shows going up is a
// change while settlement still asks only that the rows be as the build found
// them. Nothing here names a kind of page or a web role. Pure.

import { createHash } from "node:crypto";
import type { AutomationStudioTrialCollection } from "../trial-change/index.ts";
import type { AutomationStudioSiteResetRead } from "./contracts.ts";

/** A token a domain may send (`./start-check.ts`). */
const TOKEN = /^[A-Za-z0-9:_-]{1,128}$/u;
/** No domain token carries a NUL, so nothing a domain sends equals a page's own scope or group (header). */
const MARK = "\u0000page\u0000";
/** Each row's one value: it is on the page (header). */
const PRESENT = "present";
/** As many subjects as a list Core reads (`./start-check.ts`, `collectionsOf`); a page reporting more is not read whole. */
const MAX_SUBJECTS = 2_000;

/** The read's page as one list (header); none where the read names no trusted resource, no page scope, or no subjects. */
export function automationStudioSiteResetPageCollection(read: Pick<AutomationStudioSiteResetRead, "resource" | "scope" | "subjects" | "values">): AutomationStudioTrialCollection | undefined {
  const { resource, scope, subjects } = read;
  if (typeof resource !== "string" || !TOKEN.test(resource) || typeof scope !== "string" || !TOKEN.test(scope) || !Array.isArray(subjects)) return undefined;
  const rows = [...new Set(subjects)];
  if (rows.length > MAX_SUBJECTS || !rows.every((subject) => typeof subject === "string" && TOKEN.test(subject))) return undefined;
  const page = `${MARK}${resource}\u0000${scope}`;
  const values = Object.entries(read.values ?? {}).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return { scope: page, group: `${page}\u0000group`, subjects: rows, states: Object.fromEntries(rows.map((subject) => [subject, PRESENT])), values: `v:${createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 32)}` };
}
