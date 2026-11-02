import type { JsonValue } from "../../../core/index.ts";
import type { ReusableModelContextCandidate } from "./candidate.ts";

export type ReusableModelContextPacket = {
  schemaVersion: "automation-studio.reusable-llm-context-packet.v1";
  items: Array<{
    advisory: true;
    recordId: string;
    contentDigest: string;
    outcome: ReusableModelContextCandidate["outcome"];
    reviewerState: ReusableModelContextCandidate["reviewerState"];
    validationState: ReusableModelContextCandidate["validationState"];
    sourceRunIds: string[];
    sourceAdaptationIds: string[];
    promptProjection: JsonValue;
  }>;
};
