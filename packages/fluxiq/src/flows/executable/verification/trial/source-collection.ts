// Which opaque list groups of one read are malformed (moved here from
// `../site-reset/collection-groups.ts` with the settlement, t743, since the
// observations read through it and this directory needs nothing from
// site-reset). The collection shape is site-reset's
// `AutomationStudioSiteResetRead["collections"]` entry, written here.

/** One positively complete, resource-bound list inventory a read carries: its scope, group, subjects in order and their row values. */

export type SiteResetCollection = { scope: string; group: string; subjects: string[]; states: Record<string, string> };
