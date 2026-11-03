/**
 * The bound domain's instructions as one request carries them: which domain
 * they belong to, which version of them, and the text.
 *
 * Stamped on every request by the provider decorator (`./provider.ts`), never
 * by a call site, so no path that reaches a provider can leave them out. A
 * provider adapter puts the text in its system message; it is never part of
 * the user payload.
 */
export type AutomationStudioLlmTaskDomainInstructions = {
  domainId: string;
  version: string;
  text: string;
};
