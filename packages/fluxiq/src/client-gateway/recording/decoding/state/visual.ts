import type { StateBounds, StateVisualLayer } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
import { isRecordingEvidenceAnchor } from "./anchor.ts";
const bounds = S.object<StateBounds>({ x: S.number, y: S.number, width: S.number, height: S.number });
const common = { id: S.string, boundsKind: S.optional(S.oneOf("screenshot", "document")), metadata: S.optional(S.jsonObject) };
const rendered = { renderKind: S.optional(S.oneOf("screenshot-bbox", "direct-rendered")), isVisibleOnViewport: S.optional(S.boolean) };
const alternatives = [
  S.object<Extract<StateVisualLayer, { kind: "image" }>>({ ...common, kind: S.oneOf("image"), contentRef: S.string, bounds, opacity: S.optional(S.number) }),
  S.object<Extract<StateVisualLayer, { kind: "text" }>>({ ...common, ...rendered, kind: S.oneOf("text"), content: S.string, bounds: S.optional(bounds), anchor: S.optional(isRecordingEvidenceAnchor), style: S.optional(S.object<{ tone?: string; size?: "xs" | "sm" | "md" | "lg" }>({ tone: S.optional(S.string), size: S.optional(S.oneOf("xs", "sm", "md", "lg")) })) }),
  S.object<Extract<StateVisualLayer, { kind: "region" }>>({ ...common, ...rendered, kind: S.oneOf("region"), bounds, label: S.optional(S.string), statePath: S.optional(S.string), anchor: S.optional(isRecordingEvidenceAnchor) }),
  S.object<Extract<StateVisualLayer, { kind: "element" }>>({ ...common, ...rendered, kind: S.oneOf("element"), bounds: S.optional(bounds), label: S.optional(S.string), statePath: S.optional(S.string), anchor: S.optional(isRecordingEvidenceAnchor) })
];
export function isRecordingVisualLayer(value: unknown): value is StateVisualLayer { return alternatives.some(guard => guard(value)); }
