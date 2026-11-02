import type { RecordingBridgeState } from "../internal/index.ts";
export function isExecutableActionInput<TTarget, TEvidence>(state: RecordingBridgeState<TTarget, TEvidence>, domainId: string | null | undefined, inputId: string | undefined): boolean {
  if (!domainId || !inputId || !state.io) return false;
  return state.io.getRegisteredInputOutputBinding(domainId, inputId) !== null;
}
