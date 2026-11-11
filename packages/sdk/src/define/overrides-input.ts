import type { FluxNodeOverrides, FluxNodePromptSectionId, FluxNodeTextOverride } from "@fluxiq/contracts/fluxnode";

/**
 * `FluxNodeOverrides` with `prompts` keyed by `FluxNodePromptSectionId`, so section ids autocomplete.
 * Any string is still accepted (the engine refuses an unknown one as `overrides.unknown_section`).
 */
export type FluxNodeOverridesInput = Omit<FluxNodeOverrides, "prompts"> & {
  prompts?: { [Id in FluxNodePromptSectionId]?: FluxNodeTextOverride } & Record<string, FluxNodeTextOverride>;
};
