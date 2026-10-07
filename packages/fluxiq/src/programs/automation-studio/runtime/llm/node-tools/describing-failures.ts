// The library's implementation, with every node the model runs described,
// and a failed call explained by the node it named (t235, user 2026-10-01;
// t280, 2026-10-06; t289-G, 2026-10-06).
//
// An evidence build is shown every node by name only, and the full definition
// of each node it has had described (`./node-descriptions.ts`). The model may
// ask `core.describe_nodes` for definitions before it runs anything
// (`./describe-nodes.ts`); asking is never a gate.
//
// **Running a node describes it (t280).** Asking first was the advice, and the
// model did not take it: across 23 live runs it asked in 2, and lane D ran the
// list read 10-16 times per build without ever reading its definition
// (`run-mux6nxst-c9bca37c`, `run-muwao5n4-44977b2a`), because only a call that
// failed used to describe its node. So every call the model makes -- run,
// written, succeeded or refused -- adds its node to the build's memory. It
// costs no decision: nothing is refused before it runs.
//
// **The definition rides on this call's own result (t289-G, W11).** t280
// appended each new definition to `flowBootstrap.describedNodes`, the end of the
// request's constant head, in front of the tools and the whole evidence window,
// so every newly described node made the next request read the tools and every
// result again uncached (`run-murzln6g-11debe1d` C18, `run-musp4h2f-72e8ed99`
// cause 12: "append, do not insert"). Now the call that first describes a node
// names it under `describedNodes` on its own result
// (`./described-nodes-key.ts`), and the request shows the definition there, in
// place of the id (`../deepseek/request-body.ts`). The result is a window
// entry, added at the window's end and never changed, so the bytes in front of
// it stay as the last request sent them. A later call of the same node carries
// nothing new: its definition is already earlier in the request.
//
// A node is described only when its result can carry the id -- an object that
// does not already hold the key. A call that threw has no result to carry it,
// so it describes nothing and the node's next call describes it (t280 described
// it there, which put its definition in the head mid-build, the break this
// replaces). Library nodes answer objects, so in practice that is a thrown call
// only.
//
// **A failed call says so**, with any parameters it named that the definition
// does not declare. A node already described gets that list and a pointer to
// where its definition is shown.
//
// **What a failed call is** is the loop's own reading (`../evidence-loop.ts`):
// evidence that answers `ok: false`, which the loop records as a refused call,
// or a call that threw, which it records as a failed one.
//
// A rerun asked through `amend_draft` arrives here as an ordinary call of the
// library, so it is described and explained the same way. Core's own replays of
// the draft, and the reset that puts a rerun back on its step's page, carry
// `AUTOMATION_STUDIO_NODE_REPLAY_KEY` (`./replay.ts`): they are the loop
// checking its own work, never a call the model made, and pass through. The
// loop's opening call (the arrival or the first look) is the host's, not a
// replay, so its node is described on the window's first entry.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionImplementation } from "../harness-options/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY } from "./described-nodes-key.ts";
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
    const result = await implementation(input);
    const execution = isRecord(result) && result.kind === "llm_evidence_tool_execution" ? result as AutomationStudioLlmEvidenceToolExecutionResult : undefined;
    const evidence: unknown = execution ? execution.evidence : result;
    if (!isRecord(evidence) || AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY in evidence) return result;
    const newlyDescribed = memory.describe([node]).described.length > 0;
    const refused = evidence.ok === false;
    if (!newlyDescribed && !refused) return result;
    const declared = new Set(definition.parameters.map((parameter) => parameter.id));
    const parameters = input.value.parameters;
    const undeclared = refused && isRecord(parameters) ? Object.keys(parameters).filter((key) => !declared.has(key)) : [];
    const note: JsonObject = {
      ...(newlyDescribed ? { [AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY]: [node] } : { definition: `${node} is under describedNodes, earlier in this request` }),
      ...(undeclared.length ? { undeclaredParameters: undeclared } : {})
    };
    // Added beside what the domain said, never over it.
    const explained: JsonObject = { ...evidence };
    for (const [key, value] of Object.entries(note)) if (!(key in explained)) explained[key] = value as JsonValue;
    return execution ? { ...execution, evidence: explained } : explained;
  };
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
