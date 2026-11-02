import type { ActionVisualEntityTarget } from "@fluxiq/contracts/runtime";
import type { StatePath } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "./shape.ts";
import { isRecordingEvidenceAnchor } from "./state/index.ts";
const path = S.object<StatePath>({ namespace: S.string, path: S.string });
export const isRecordingVisualTarget = S.object<ActionVisualEntityTarget>({ entityId: S.string, entityKind: S.optional(S.string), statePath: S.optional(path), anchor: S.optional(isRecordingEvidenceAnchor), visualFrameId: S.optional(S.string), visualLayerId: S.optional(S.string), stateSnapshotId: S.optional(S.string), confidence: S.optional(S.number), source: S.optional(S.oneOf("importer", "runtime", "inferred", "operator")), metadata: S.optional(S.jsonObject) });
