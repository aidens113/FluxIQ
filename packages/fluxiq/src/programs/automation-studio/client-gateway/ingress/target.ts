import type { ActionTarget } from "../../model/index.ts";
import { isAutomationStudioElementTarget, validateAutomationStudioElementTarget } from "../../model/index.ts";
import { RecordingIngressShapes as S, isRecordingVisualTarget } from "../../../../client-gateway/recording/decoding/index.ts";
const bounds = S.object<NonNullable<ActionTarget["bounds"]>>({ x: S.number, y: S.number, width: S.number, height: S.number });
const position = S.object<NonNullable<ActionTarget["relativePosition"]>>({ x: S.number, y: S.number });
// Legacy locator keys remain opaque scalar data in the persisted Studio envelope.
const legacyTextFields = ["selector"] as const;
const accepts = S.object<Omit<ActionTarget, (typeof legacyTextFields)[number]>>({ type: S.string, id: S.optional(S.string), label: S.optional(S.string), bounds: S.optional(bounds), relativePosition: S.optional(position), visualTarget: S.optional(isRecordingVisualTarget), elementTarget: S.optional(isAutomationStudioElementTarget), metadata: S.optional(S.jsonObject) });
export function isStudioRecordingTarget(value: unknown): value is ActionTarget {
  if (!S.record(value)) return false;
  const legacyFieldsValid = legacyTextFields.every(key => value[key] === undefined || S.string(value[key]));
  return legacyFieldsValid && accepts(value)
    && (!value.elementTarget || validateAutomationStudioElementTarget(value.elementTarget).ok);
}
