// The model's way to read the nodes it is about to use, in full.
//
// An evidence build is shown every node of the library by name only, and the
// definitions of just the nodes this build asked about
// (`./node-descriptions.ts`). This is the asking. It is Core's: the library is
// Core's, whatever domain runs its nodes, and reading a definition touches no
// target, so a domain neither declares nor carries it out.
//
// **The answer names the nodes; the request shows their definitions on it
// (t289-G, W11).** The receipt lists the newly described ids under
// `describedNodes` (`./described-nodes-key.ts`), and the request puts each
// definition there in place of its id (`../deepseek/request-body.ts`). The
// receipt is a window entry, which never changes or leaves once it is in
// (`../context-window.ts`), so each definition appears once per request for the
// rest of the build, however long ago it was asked for. It used to be shown
// under `flowBootstrap.describedNodes`, at the end of the request's constant
// head: every describe then changed the bytes in front of the tools and the
// whole window, and the next request read them again uncached
// (`run-murzln6g-11debe1d` C18). The definitions are not written into the
// receipt itself, so the build's own record of the call -- its step log, its
// repeat guard -- holds ids, not catalog text.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionBundle } from "../harness-options/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY } from "./described-nodes-key.ts";
import type { AutomationStudioLlmNodeDescriptions } from "./node-descriptions.ts";

/** The option that describes nodes. */
export const AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID = "core.describe_nodes";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_IDS = 64;

const DESCRIPTION = [
  "Show the full definitions of library nodes: what each does and every parameter it takes.",
  "A node you run is shown too; ask before its first run only to learn its parameters, several ids per call.",
  "Each definition is shown once, under describedNodes in the result of the call that first described it, for the rest of the build: never ask for one again.",
  "Observes only; never a step of the Flow."
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
        // Shown with their definitions in place of the ids; one already described is earlier in the request.
        const receipt: JsonObject = {
          ok: true,
          ...(answer.described.length ? { [AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY]: answer.described } : {}),
          ...(answer.alreadyDescribed.length ? { alreadyDescribed: answer.alreadyDescribed, alreadyShown: "under describedNodes, earlier in this request" } : {}),
          ...(answer.unknown.length ? { unknown: answer.unknown } : {})
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
