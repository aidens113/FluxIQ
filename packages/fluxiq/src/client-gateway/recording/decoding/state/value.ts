import type { StateValue, SignalProvenance } from "@fluxiq/contracts/state";
import { RecordingIngressShapes as S } from "../shape.ts";
import { isRecordingPresentation } from "./presentation.ts";
const provenance = S.object<SignalProvenance>({ extractorId: S.string, extractorVersion: S.string, inputs: S.array(S.string), computationHash: S.optional(S.string) });
export const isRecordingStateValue = S.object<StateValue>({ type: S.oneOf("string", "number", "integer", "boolean", "point", "rectangle", "entity_ref", "entity_ref_list", "hash", "json", "unknown"), value: S.unknown, observedAt: S.number, sourceId: S.optional(S.string), confidence: S.optional(S.number), volatility: S.optional(S.oneOf("static", "slow", "normal", "rapid")), semanticRole: S.optional(S.string), comparable: S.optional(S.boolean), sensitive: S.optional(S.boolean), presentation: S.optional(isRecordingPresentation), provenance: S.optional(provenance), metadata: S.optional(S.jsonObject) });
