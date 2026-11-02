import type { JsonObject } from "../../../../../core/index.ts";
import type { DraftAmendmentDescriptions } from "../../presentation/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA } from "./shape.ts";

export function automationStudioFlowDraftAmendmentSchema(descriptions: DraftAmendmentDescriptions): JsonObject {
  const properties = AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties;
  return {
    ...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA,
    properties: {
      step: { ...properties.step, description: descriptions.step },
      change: { ...properties.change, description: descriptions.change },
      settings: { ...properties.settings, description: descriptions.settings },
      to: { ...properties.to, description: descriptions.to },
      input: { ...properties.input, description: descriptions.input },
      check: { ...properties.check, description: descriptions.check },
      through: { ...properties.through, description: descriptions.through },
      over: { ...properties.over, description: descriptions.over },
      while: { ...properties.while, description: descriptions.while },
      most: { ...properties.most, description: descriptions.most },
      act: { ...properties.act, description: descriptions.act },
      place: { ...properties.place, description: descriptions.place }
    }
  };
}
