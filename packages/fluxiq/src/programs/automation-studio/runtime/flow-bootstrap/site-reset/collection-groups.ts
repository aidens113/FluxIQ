import type { AutomationStudioSiteResetRead } from "./contracts.ts";

/** Reject a whole opaque group before scope Maps or subject Sets lose malformed sibling evidence. */
export function automationStudioSiteResetInvalidCollectionGroups(collections: NonNullable<AutomationStudioSiteResetRead["collections"]>): Set<string> {
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
