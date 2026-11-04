// The end of a walk (rule 5): every successful recorded act was used or holds a
// reducer's receipt, and the run ended where the recording's result was read. A
// successful act never used, with no receipt, is `recorded_act_skipped`: a
// demonstrated defect, because the recording shows the task needed it. Ending where
// the recording itself ended counts too: an exploration may look elsewhere after it
// read its result, and a Flow that repeats it has not missed anything.

import type { ClientGatewayTraceStateEndCheck, ClientGatewayTraceStateRecording } from "./types.ts";
import type { ClientGatewayTraceStateWalker } from "./walker.ts";

export function clientGatewayTraceStateEndCheck(recording: ClientGatewayTraceStateRecording, walker: Pick<ClientGatewayTraceStateWalker, "used" | "rows" | "currentNode" | "afterChangedRows">): ClientGatewayTraceStateEndCheck {
  const used = new Set(walker.used);
  const receipted: number[] = [];
  const skipped: number[] = [];
  for (const entry of recording.entries) {
    if (entry.kind !== "act" || entry.reading.outcome !== "succeeded" || used.has(entry.index)) continue;
    if (recording.receipts.has(entry.index)) receipted.push(entry.index);
    else skipped.push(entry.index);
  }
  return {
    used: [...used].sort((left, right) => left - right),
    receipted,
    skipped,
    reachedEnd: walker.currentNode === recording.resultNode || walker.currentNode === recording.endNode,
    rows: walker.rows,
    afterChangedRows: walker.afterChangedRows
  };
}
