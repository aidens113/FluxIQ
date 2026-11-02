import type { StateSnapshot, StateNamespace, StateSnapshotPresentation } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
import { isRecordingStateValue } from "./value.ts";
import { isRecordingVisualFrame } from "./frame.ts";
const namespace = S.object<StateNamespace>({ schemaId: S.string, schemaVersion: S.string, values: S.dictionary(isRecordingStateValue), metadata: S.optional(S.jsonObject) });
const presentation = S.object<StateSnapshotPresentation>({ visualFrames: S.optional(S.array(isRecordingVisualFrame)), defaultFrameId: S.optional(S.string), metadata: S.optional(S.jsonObject) });
export const isRecordingStateSnapshot = S.object<StateSnapshot>({ id: S.optional(S.string), timestamp: S.number, namespaces: S.dictionary(namespace), presentation: S.optional(presentation), metadata: S.optional(S.jsonObject) });
