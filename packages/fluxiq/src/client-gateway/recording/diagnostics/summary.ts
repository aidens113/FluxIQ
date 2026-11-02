import type { DiscardedClientMessage } from "../internal/index.ts";
export function discardedClientMessageSummary(
  discarded: DiscardedClientMessage,
  recordingId: string | undefined,
  executable: boolean,
  sinceFinalizedMs: number | undefined
): string {
  const what = executable ? `an executable action (${discarded.label})` : `a client ${discarded.kind} (${discarded.label})`;
  if (!recordingId) return `Discarded ${what} that arrived while this client had no recording open.`;
  const lost = sinceFinalizedMs === undefined
    ? `Discarded ${what} for recording ${recordingId}, which this client did not have open.`
    : `Discarded ${what} that arrived ${sinceFinalizedMs} ms after recording ${recordingId} was finalized.`;
  return executable ? `${lost} The client believes it was recorded; the recording does not contain it.` : lost;
}
