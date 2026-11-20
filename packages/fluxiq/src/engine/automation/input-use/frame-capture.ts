import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputUseLocation } from "./location.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";

export type AutomationStudioInputUseFrameCapture = Readonly<{
  values: JsonObject;
  declaredInputDefaults?: JsonObject;
  location: AutomationStudioInputUseLocation;
  boundary?: AutomationStudioInputUseChildCapture;
}>;
