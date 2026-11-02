import type { SourceDescriptor } from "@fluxiq/contracts/recording";
import { RecordingIngressShapes as S } from "./shape.ts";
const accepts = S.array(S.object<SourceDescriptor>({ id: S.string, label: S.string, kind: S.oneOf("state", "action", "event", "note", "observation", "derived"), schemaId: S.optional(S.string), schemaVersion: S.optional(S.string), metadata: S.optional(S.jsonObject) }));
export function decodeRecordingSources(value: unknown): SourceDescriptor[] {
  if (!accepts(value)) throw new Error("recording.invalid_sources");
  return value;
}
