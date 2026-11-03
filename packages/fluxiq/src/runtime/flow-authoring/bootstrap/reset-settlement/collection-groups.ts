// Which opaque list groups of one read are malformed (moved here from
// `../site-reset/collection-groups.ts` with the settlement, t743, since the
// observations read through it and this directory needs nothing from
// site-reset). The collection shape is site-reset's
// `AutomationStudioSiteResetRead["collections"]` entry, written here.

/** One positively complete, resource-bound list inventory a read carries: its scope, group, subjects in order and their row values. */
export type AutomationStudioSiteResetCollection = { scope: string; group: string; subjects: string[]; states: Record<string, string> };

/** Reject a whole opaque group before scope Maps or subject Sets lose malformed sibling evidence. */
export function automationStudioSiteResetInvalidCollectionGroups(collections: readonly AutomationStudioSiteResetCollection[]): Set<string> {
  const invalid = new Set<string>(), scopes = new Map<string, string>();
  for (const collection of collections) {
    const { scope, group, subjects, states } = collection;
    const prior = scopes.get(scope);
    if (prior !== undefined) {
      invalid.add(prior);
      invalid.add(group);
    }
    scopes.set(scope, group);
    if (!scope || !group || !Array.isArray(subjects) || new Set(subjects).size !== subjects.length || !states || typeof states !== "object" || Object.keys(states).length !== subjects.length || subjects.some((subject) => typeof subject !== "string" || !subject || !Object.hasOwn(states, subject) || typeof states[subject] !== "string" || !states[subject]!.trim())) invalid.add(group);
  }
  return invalid;
}
