import type { EnvironmentDescriptor } from "@fluxiq/contracts/recording";
import { RecordingIngressShapes as S } from "./shape.ts";
const accepts = S.object<Partial<EnvironmentDescriptor>>({ id: S.optional(S.string), label: S.optional(S.string), kind: S.optional(S.string), domainId: S.optional(S.nullableString), capabilities: S.optional(S.array(S.string)), metadata: S.optional(S.jsonObject) });
export function decodeRecordingEnvironment(value: unknown): Partial<EnvironmentDescriptor> {
  if (!accepts(value)) throw new Error("recording.invalid_environment");
  return value;
}
