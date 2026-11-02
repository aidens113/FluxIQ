import type { ActionTarget } from "../model/index.ts";
import type { EvidenceReference } from "../model/index.ts";
import { AutomationStudioRecordingController as Controller } from "../../../runtime/recording/index.ts";
import type { AutomationStudioRecordingControllerOptions as Options } from "../../../runtime/recording/index.ts";
export const AutomationStudioRecordingController = Controller<ActionTarget, EvidenceReference>;
export type AutomationStudioRecordingController = Controller<ActionTarget, EvidenceReference>;
export type AutomationStudioRecordingControllerOptions = Options<ActionTarget, EvidenceReference>;
