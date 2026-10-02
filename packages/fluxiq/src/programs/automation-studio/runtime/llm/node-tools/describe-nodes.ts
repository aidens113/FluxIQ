// The model's way to read the nodes it is about to use, in full.
//
// An evidence build is shown every node of the library by name only, and the
// definitions of just the nodes this build asked about
// (`./node-descriptions.ts`). This is the asking. It is Core's: the library is
// Core's, whatever domain runs its nodes, and reading a definition touches no
// target, so a domain neither declares nor carries it out.
//
// **The answer is a receipt, never the definitions.** A definition shown in a
// call's result would be shown again in every later decision that carries the
// result, and pushed out by the context window with it. Shown under
// `flowBootstrap.describedNodes` instead, each definition appears once per
// request for the rest of the build, however long ago it was asked for.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionBundle } from "../harness-options/index.ts";
import type { AutomationStudioLlmNodeDescriptions } from "./node-descriptions.ts";

/** The option that describes nodes. */
export const AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID = "core.describe_nodes";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_IDS = 64;

const DESCRIPTION = [
  "Show the full definitions of library nodes: what each does and every parameter it takes.",
  "Ask once, before running them, for all the nodes you are about to use, several ids per call.",
  "A described node stays in flowBootstrap.describedNodes for the rest of the build, so never ask for it again.",
  "Returns a receipt; the definitions are shown there. Observes only; never a step of the Flow."
].join(" ");

/**
 * Core's bundle holding `core.describe_nodes` for one build's memory.
 *
 * Unscoped (`availability: both`) and observe-only, like Core's own options
 * (`../harness-options/builtin.ts`), so it is offered wherever the library is.
 */
export function automationStudioLlmDescribeNodesBundle(memory: AutomationStudioLlmNodeDescriptions): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    options: [{
      toolId: AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID,
      description: DESCRIPTION,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["ids"],
        properties: {
          ids: {
            type: "array",
            minItems: 1,
            maxItems: MAX_IDS,
            uniqueItems: true,
            // No enum: the names are in flowBootstrap.nodeCatalog. An id the
            // catalog does not hold is listed under `unknown`; a call naming
            // only such ids is refused `describe_nodes.unknown_nodes`.
            items: { type: "string", pattern: IDENTIFIER.source },
            description: "The ids of the nodes to describe, each copied exactly from flowBootstrap.nodeCatalog, where it comes before the colon."
          }
        }
      },
      effect: "observe",
      availability: { kind: "both" },
      safety: { sideEffect: "observe" }
    }],
    implementations: {
      [AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID]: async (input) => {
        const ids = input.value.ids;
        if (Object.keys(input.value).some((key) => key !== "ids") || !Array.isArray(ids) || !ids.length || ids.length > MAX_IDS
          || !ids.every((id): id is string => typeof id === "string" && IDENTIFIER.test(id))) {
          return rejection("harness_option.input_invalid");
        }
        const answer = memory.describe(ids);
        if (!answer.described.length && !answer.alreadyDescribed.length) return rejection("describe_nodes.unknown_nodes", { unknown: answer.unknown });
        const receipt: JsonObject = {
          ok: true,
          described: answer.described,
          ...(answer.alreadyDescribed.length ? { alreadyDescribed: answer.alreadyDescribed } : {}),
          ...(answer.unknown.length ? { unknown: answer.unknown } : {}),
          shownIn: "flowBootstrap.describedNodes"
        };
        return receipt;
      }
    }
  };
}

/**
 * A refusal the model can act on, shaped as Core's own options refuse
 * (`../harness-options/builtin.ts`): the loop reads `{ok:false,code}` as
 * feedback and the model picks again.
 */
function rejection(code: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  const evidence: JsonValue = { ok: false, code, ...detail };
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, resultCode: code };
}
