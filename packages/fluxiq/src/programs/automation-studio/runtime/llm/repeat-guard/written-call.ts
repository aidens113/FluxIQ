// Whether a call wrote its step into the Flow rather than running it (t252):
// `core.run_node` with `write: true`, answered `core.run_node.written`
// (`../node-tools/replay.ts`). The host checked the step, froze what it names
// and added it; nothing was done on the page, by design. So it is no attempt of
// its input that failed or changed nothing, and the repeat guard records no
// outcome for it (`./outcomes.ts`, t707 D1). Read exactly as the decision parse
// reads a written step (`../evidence-loop-decision.ts`): only beside the code
// that says so, so a host that ignored `write` and acted is an ordinary call.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_NODE_WRITE_KEY, AUTOMATION_STUDIO_NODE_WRITTEN_CODE } from "../node-tools/replay.ts";

/** Whether `call` asked to write its step and the host answered that it was written, not refused. */
export function automationStudioLlmEvidenceCallWritten(call: { input: JsonObject; refused: boolean; resultCode?: string | undefined }): boolean {
  return !call.refused && call.resultCode === AUTOMATION_STUDIO_NODE_WRITTEN_CODE && call.input[AUTOMATION_STUDIO_NODE_WRITE_KEY] === true;
}
