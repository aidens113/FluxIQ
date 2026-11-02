import type { StatePresentationMetadata } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
import { isRecordingEvidenceAnchor } from "./anchor.ts";
export const isRecordingPresentation = S.object<StatePresentationMetadata>({ label: S.optional(S.string), description: S.optional(S.string), group: S.optional(S.string), icon: S.optional(S.string), order: S.optional(S.number), anchor: S.optional(isRecordingEvidenceAnchor), visualKind: S.optional(S.oneOf("image", "text", "bounds", "table", "tree", "metric", "badge", "json")), sensitive: S.optional(S.boolean), metadata: S.optional(S.jsonObject) });
