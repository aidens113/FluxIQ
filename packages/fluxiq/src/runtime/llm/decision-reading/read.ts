// A decision as Core reads it, the one reading every reader applies.
//
// **Two readers held one reply to two grammars** (t1025). The harness read a
// decision whose kind it did not know as the tool call it could only be, and
// moved a tool's input key written beside `input` into it; the Anthropic
// adapter, which checks the whole reply against the schema first, did neither,
// and refused such replies as off-shape before the harness saw them -- telling
// the model, from the schema variant it came "nearest", to call a tool it never
// meant. The bigbox runs of 2026-11-24 had 22 paid decisions of about 120k
// input tokens each refused unread, 16 of them that way. Now there is one reading, here, and both apply
// it: the adapter checks the decision as read, and the harness reads it and
// says so in the step log.
//
// In order, each on what the one before left:
//
//   1. a tool call's own optional key written `null` is not written (`./own-key-nulls.ts`);
//   2. a tool call written flat under its tool's name is that call (`./flat-tool-call.ts`);
//   3. a decision that can only be a tool call is one (`./inferred-tool-call.ts`);
//   4. a `toolId` that is a value an offered tool's input names there is that tool (`./value-tool-id.ts`);
//   5. a tool's input key written beside `input` goes into it (`../tool-call-keys/folded.ts`);
//   6. a call's own key (`add`, `act`, `place`) written inside `input` comes out beside it (`./own-keys-lifted.ts`, t1034).
//
// Grammar only. Every one reads a shape that can mean one decision and nothing
// else; none makes a decision the schema does not offer acceptable, and the
// read decision goes through every check one written so would. Total and pure:
// the same reply reads the same way every time, so the adapter's reading and
// the harness's agree.

import { automationStudioLlmToolCallKeysFolded } from "../tool-call-keys/index.ts";
import { automationStudioLlmDecisionFlatToolCall } from "./flat-tool-call.ts";
import { automationStudioLlmDecisionInferredToolCall } from "./inferred-tool-call.ts";
import { automationStudioLlmDecisionOwnKeyNulls } from "./own-key-nulls.ts";
import { automationStudioLlmDecisionOwnKeysLifted } from "./own-keys-lifted.ts";
import type { AutomationStudioLlmDecisionReading } from "./reading.ts";
import type { AutomationStudioLlmDecisionReadingTool } from "./tool.ts";
import { automationStudioLlmDecisionValueToolId } from "./value-tool-id.ts";

/**
 * The decision as read against the offered tools, and each reading that
 * changed it; the decision as it came, and none, when nothing did. Without
 * tools, only the readings that need none apply.
 */
export function automationStudioLlmDecisionRead(decision: unknown, tools: readonly AutomationStudioLlmDecisionReadingTool[] | undefined): { decision: unknown; readings: AutomationStudioLlmDecisionReading[] } {
  const readings: AutomationStudioLlmDecisionReading[] = [];
  let read: unknown = decision;
  const nulls = automationStudioLlmDecisionOwnKeyNulls(read);
  if (nulls) {
    read = nulls.decision;
    readings.push({ code: "own_key_nulls", keys: nulls.keys });
  }
  const flat = automationStudioLlmDecisionFlatToolCall(read, tools);
  if (flat) {
    read = flat.decision;
    readings.push({ code: "flat_tool_call", toolId: flat.toolId, callIdFilled: flat.callIdFilled });
  }
  const inferred = automationStudioLlmDecisionInferredToolCall(read);
  if (inferred) {
    read = inferred.decision;
    readings.push({ code: "kind_inferred", kindWritten: inferred.kindWritten, callIdFilled: inferred.callIdFilled });
  }
  const valued = automationStudioLlmDecisionValueToolId(read, tools);
  if (valued) {
    read = valued.decision;
    readings.push({ code: "value_tool_id", toolId: valued.toolId, key: valued.key });
  }
  const folded = automationStudioLlmToolCallKeysFolded(read, tools);
  if (folded) {
    read = folded.decision;
    readings.push({ code: "keys_folded", toolId: folded.toolId, movedKeys: folded.movedKeys });
  }
  const lifted = automationStudioLlmDecisionOwnKeysLifted(read, tools);
  if (lifted) {
    read = lifted.decision;
    readings.push({ code: "own_keys_lifted", keys: lifted.keys });
  }
  return { decision: read, readings };
}
