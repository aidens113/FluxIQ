import type { StateValueType } from "./value-type.js";
import type { StateVolatility } from "./volatility.js";
import type { StatePresentationMetadata } from "./presentation-metadata.js";
import type { SignalProvenance } from "./signal-provenance.js";
import type { JsonObject } from "../../core.js";

export type StateValue<T = unknown> = {
  type: StateValueType;
  value: T;
  observedAt: number;
  sourceId?: string;
  confidence?: number;
  volatility?: StateVolatility;
  semanticRole?: string;
  comparable?: boolean;
  sensitive?: boolean;
  presentation?: StatePresentationMetadata;
  provenance?: SignalProvenance;
  metadata?: JsonObject;
};
