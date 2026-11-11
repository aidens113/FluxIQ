// Overrides after the declaration and a run's own are merged: no `default` entries are left,
// and every group is present.

import type { FluxNodeOverrides } from "./schema.ts";
import type { FluxNodeTextOverride } from "./text-override.ts";

export type FluxNodeResolvedOverrides = {
  prompts: Record<string, Exclude<FluxNodeTextOverride, { mode: "default" }>>;
  judgeCriteria: string[];
  tools: Record<string, Exclude<FluxNodeTextOverride, { mode: "default" }>>;
  models: NonNullable<FluxNodeOverrides["models"]>;
  deadlines: NonNullable<FluxNodeOverrides["deadlines"]>;
  retryWaits: NonNullable<FluxNodeOverrides["retryWaits"]>;
  pace: NonNullable<FluxNodeOverrides["pace"]>;
};
