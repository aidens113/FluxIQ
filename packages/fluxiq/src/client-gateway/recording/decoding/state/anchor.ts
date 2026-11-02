import type { EvidenceAnchor, StateBounds } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
const bounds = S.object<StateBounds>({ x: S.number, y: S.number, width: S.number, height: S.number });
const common = { metadata: S.optional(S.jsonObject), rendererId: S.optional(S.string) };
const alternatives = [
  S.object<Extract<EvidenceAnchor, { type: "none" }>>({ type: S.oneOf("none"), metadata: common.metadata }),
  S.object<Extract<EvidenceAnchor, { type: "point" }>>({ ...common, type: S.oneOf("point"), x: S.number, y: S.number }),
  S.object<Extract<EvidenceAnchor, { type: "bounds" }>>({ ...common, type: S.oneOf("bounds"), bounds, boundsKind: S.optional(S.oneOf("screenshot", "document")) }),
  S.object<Extract<EvidenceAnchor, { type: "element" }>>({ ...common, type: S.oneOf("element"), elementId: S.string }),
  S.object<Extract<EvidenceAnchor, { type: "entity" }>>({ ...common, type: S.oneOf("entity"), entityId: S.string, entityKind: S.optional(S.string) }),
  S.object<Extract<EvidenceAnchor, { type: "region" }>>({ ...common, type: S.oneOf("region"), regionId: S.string }),
  S.object<Extract<EvidenceAnchor, { type: "path" }>>({ ...common, type: S.oneOf("path"), points: S.array(S.object<{ x: number; y: number }>({ x: S.number, y: S.number })) })
];
export function isRecordingEvidenceAnchor(value: unknown): value is EvidenceAnchor { return alternatives.some(guard => guard(value)); }
