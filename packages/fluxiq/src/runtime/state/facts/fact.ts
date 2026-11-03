import type { StateFactReference } from "./index.ts";
import type { StateValue } from "@fluxiq/contracts/state";
import type { EvidenceAnchor } from "@fluxiq/contracts/state";
import type { StatePresentationMetadata } from "@fluxiq/contracts/state";
import type { JsonObject } from "../../../core/index.ts";

export type StateFact = StateFactReference & {
  id?: string;
  value?: StateValue;
  confidence?: number;
  anchor?: EvidenceAnchor;
  presentation?: StatePresentationMetadata;
  metadata?: JsonObject;
};
