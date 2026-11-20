import type { AutomationStudioInputUseBoundaryCapture } from "./boundary-capture.ts";
import type { AutomationStudioInputUseLocation } from "./location.ts";

export type AutomationStudioInputUseChildCapture = Readonly<{
  boundary: AutomationStudioInputUseBoundaryCapture;
  parent: AutomationStudioInputUseLocation;
  child: AutomationStudioInputUseLocation;
}>;
