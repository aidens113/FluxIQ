// The library's implementation, with every node the model runs described,
// and a failed call explained by the node it named (t235, user 2026-10-01;
// t280, 2026-10-06).
//
// An evidence build is shown every node by name only, and the full definitions
// of the nodes under `flowBootstrap.describedNodes` (`./node-descriptions.ts`).
// The model may ask `core.describe_nodes` for definitions before it runs
// anything (`./describe-nodes.ts`); asking is never a gate.
//
// **Running a node describes it (t280).** Asking first was the advice, and the
// model did not take it: across 23 live runs it asked in 2, and lane D ran the
// list read 10-16 times per build without ever reading its definition
// (`run-mux6nxst-c9bca37c`, `run-muwao5n4-44977b2a`), because only a call that
// failed used to describe its node. So every call the model makes -- run,
// written, succeeded or refused -- adds its node to the build's memory, and the
// definition is shown from the next decision on. It costs no decision: a call
// that succeeded is returned untouched and nothing is refused before it runs.
// It costs request bytes once per node (the definition, 0.4-2.7 KB, in the
// cached head beside the ones already there).
//
// **A failed call says so**, once, with any parameters it named that the
// definition does not declare. A node already described gets only that list
// and a pointer to where its definition is shown.
//
// **What a failed call is** is the loop's own reading (`../evidence-loop.ts`):
// evidence that answers `ok: false`, which the loop records as a refused call,
// or a call that threw, which it records as a failed one. A thrown call has no
// evidence to explain, so its node is only described.
//
// A rerun asked through `amend_draft` arrives here as an ordinary call of the
// library, so it is described and explained the same way. Core's own replays of
// the draft, and the reset that puts a rerun back on its step's page, carry
// `AUTOMATION_STUDIO_NODE_REPLAY_KEY` (`./replay.ts`): they are the loop
// checking its own work, never a call the model made, and pass through. The
// loop's opening call (the arrival or the first look) is the host's, not a
// replay, so its node is described before the first decision is asked.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionImplementation } from "../harness-options/index.ts";
import type { AutomationStudioLlmNodeDescriptions } from "./node-descriptions.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_KEY } from "./replay.ts";

/** `implementation` (the library's), describing the node of each call it makes and explaining each call that fails. */
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
    const newlyDescribed = memory.describe([node]).described.length > 0;
    if (!isRecord(evidence) || evidence.ok !== false) return result;
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
