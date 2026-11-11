// Splits a run's `overrides` into the contracts' two fields: `options` (retries, judge, budget,
// model, mode, timeout) and `overrides` (prompts, judge criteria, tools, models, deadlines,
// retry waits, pace). The key sets are disjoint, so one flat object says everything.

import { fluxNodeOptionsSchema, type FluxNodeOptions, type FluxNodeOverrides } from "@fluxiq/contracts/fluxnode";

const OPTION_KEYS: ReadonlySet<string> = new Set(Object.keys(fluxNodeOptionsSchema.shape));

/** `options` and `overrides` as the request carries them; a part with no keys is absent. An unknown key goes to `overrides`, where the engine refuses it by name. */
export function splitRunOverrides(flat: Record<string, unknown>): { options?: FluxNodeOptions; overrides?: FluxNodeOverrides } {
  const options: Record<string, unknown> = {};
  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) (OPTION_KEYS.has(key) ? options : overrides)[key] = value;
  const out: { options?: FluxNodeOptions; overrides?: FluxNodeOverrides } = {};
  if (Object.keys(options).length > 0) out.options = options as FluxNodeOptions;
  if (Object.keys(overrides).length > 0) out.overrides = overrides as FluxNodeOverrides;
  return out;
}
