// The library's implementation, with a failed call explained by the node it
// named (t235, user 2026-10-01).
//
// An evidence build is shown every node by name only and asks
// `core.describe_nodes` for the definitions of the nodes it is about to use
// (`./describe-nodes.ts`). Asking first is the advice, never a gate.
//
// **Never a refusal before the call.** A model that runs a node it never asked
// about, and gets it right, simply ran it. Only once a call has failed is its
// node described -- added to the build's memory (`./node-descriptions.ts`), so
// its definition is shown from the next decision on -- and the failure says so,
// once, with any parameters it named that the definition does not declare. A
// node already described gets only that list and a pointer to where its
// definition is shown. A call that succeeded is returned untouched.
//
// **What a failed call is** is the loop's own reading (`../evidence-loop.ts`):
// evidence that answers `ok: false`, which the loop records as a refused call,
// or a call that threw, which it records as a failed one. A thrown call has no
// evidence to explain, so its node is only described.
//
// A rerun asked through `amend_draft` arrives here as an ordinary call of the
// library, so it is explained the same way. Core's own replays of the draft,
// and the reset that puts a rerun back on its step's page, carry
// `AUTOMATION_STUDIO_NODE_REPLAY_KEY` (`./replay.ts`): they are the loop
// checking its own work, never a call the model made, and pass through.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionImplementation } from "../harness-options/index.ts";
import type { AutomationStudioLlmNodeDescriptions } from "./node-descriptions.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_KEY } from "./replay.ts";

/** `implementation` (the library's), describing the node of each call that fails. */
export function automationStudioLlmRunNodeDescribingFailures(
  implementation: AutomationStudioHarnessOptionImplementation,
  memory: AutomationStudioLlmNodeDescriptions
): AutomationStudioHarnessOptionImplementation {
  return async (input) => {
    const node = input.value.node;
    if (typeof node !== "string" || AUTOMATION_STUDIO_NODE_REPLAY_KEY in input.value) return implementation(input);
    const definition = memory.definition(node);
    if (!definition) return implementation(input);
    let result: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
    try {
      result = await implementation(input);
    } catch (error) {
      if (!input.signal?.aborted) memory.describe([node]);
      throw error;
    }
    const execution = isRecord(result) && result.kind === "llm_evidence_tool_execution" ? result as AutomationStudioLlmEvidenceToolExecutionResult : undefined;
    const evidence: unknown = execution ? execution.evidence : result;
    if (!isRecord(evidence) || evidence.ok !== false) return result;
    const newlyDescribed = memory.describe([node]).described.length > 0;
    const declared = new Set(definition.parameters.map((parameter) => parameter.id));
    const parameters = input.value.parameters;
    const undeclared = isRecord(parameters) ? Object.keys(parameters).filter((key) => !declared.has(key)) : [];
    const note: JsonObject = {
      ...(newlyDescribed ? { described: `${node} is now in flowBootstrap.describedNodes` } : { definition: `${node} is in flowBootstrap.describedNodes` }),
      ...(undeclared.length ? { undeclaredParameters: undeclared } : {})
    };
    // Added beside what the domain said, never over it.
    const explained: JsonObject = { ...evidence };
    for (const [key, value] of Object.entries(note)) if (!(key in explained)) explained[key] = value;
    return execution ? { ...execution, evidence: explained } : explained;
  };
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
