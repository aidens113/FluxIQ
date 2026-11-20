import type { AutomationStudioInputUseLayer } from "./layer.ts";

/** The layers a run actually assembled into its root inputs, later layers winning; an absent layer is simply not listed. */
export type AutomationStudioInputUseEntry = Readonly<{ layers: readonly AutomationStudioInputUseLayer[] }>;
