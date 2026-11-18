/** Undefined means missing/unknown authority; null is a known global project. */
export type AutomationStudioRuntimeProjectDomainLookup = (projectId: string) => string | null | undefined | Promise<string | null | undefined>;
