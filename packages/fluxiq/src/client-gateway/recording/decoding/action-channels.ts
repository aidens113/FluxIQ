import type { ActionChannelDescriptor } from "@fluxiq/contracts/recording";
import { RecordingIngressShapes as S } from "./shape.ts";
const accepts = S.array(S.object<ActionChannelDescriptor>({ id: S.string, label: S.string, actionTypes: S.array(S.string), capabilities: S.optional(S.array(S.string)), metadata: S.optional(S.jsonObject) }));
export function decodeRecordingActionChannels(value: unknown): ActionChannelDescriptor[] {
  if (!accepts(value)) throw new Error("recording.invalid_action_channels");
  return value;
}
