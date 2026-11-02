import type { StateCoordinateSpace, StateVisualFrame } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
import { isRecordingPresentation } from "./presentation.ts";
import { isRecordingVisualLayer } from "./visual.ts";
const coordinateSpace = S.object<StateCoordinateSpace>({ width: S.number, height: S.number, unit: S.oneOf("px", "world", "cell", "normalized"), origin: S.optional(S.oneOf("top-left", "bottom-left", "center")), scale: S.optional(S.number), metadata: S.optional(S.jsonObject) });
export const isRecordingVisualFrame = S.object<StateVisualFrame>({ id: S.string, rendererId: S.optional(S.string), label: S.optional(S.string), coordinateSpace, layers: S.array(isRecordingVisualLayer), presentation: S.optional(isRecordingPresentation), metadata: S.optional(S.jsonObject) });
