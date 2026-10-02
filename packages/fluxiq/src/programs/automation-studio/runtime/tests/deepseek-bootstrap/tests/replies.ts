// The decisions and judge answers the bootstrap-exploration cases script into
// the stub DeepSeek endpoint (`harness.ts`): what one call is answered with,
// the looks and completions the cases build their scripts from, and the
// measured run's decision script with the judge's no to its Flow.

import type { JsonObject } from "../../../../../../core/index.ts";

export const LOOK_TOOL_ID = "demo.look";

/** How the endpoint answers one decision call: a decision, or a failure. */
export type Reply = JsonObject | "malformed" | "timeout_after_send" | "unauthorized";

/**
 * How the endpoint answers one `loop_verification` call: the judge of a
 * finished build's test (`result-verification/build-test/judge.ts`). Its
 * `answersRequest`, and the rest of what its diagnosis said (`changed` is read
 * as its advice). Verify asks again on anything but `yes`, so a `no` is two
 * calls (`result-verification/verify.ts`).
 */
export type JudgeReply = { answersRequest: "yes" | "no" | "unknown"; expected?: string; observed?: string; changed?: string };

export function look(iteration: number): JsonObject {
  return { kind: "tool_call", callId: `call.${iteration}`, toolId: LOOK_TOOL_ID, input: { area: `area.${iteration}` } };
}

export function complete(): JsonObject {
  return {
    kind: "complete",
    result: {
      summary: "Start and finish.",
      plan: {
        schemaVersion: "0.1",
        router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
        subflows: [{
          key: "primary",
          name: "Primary",
          role: "primary",
          nodes: [
            { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
            { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
          ],
          edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
        }]
      }
    }
  };
}

function recordsPlan(includeExtraction: boolean): JsonObject {
  const nodes: Array<JsonObject & { key: string }> = [
    { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
    { key: "open", definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://catalog.example.test/items" } },
    { key: "filter", definitionId: "web.output.dom-type", definitionVersion: "1.0.0", parameters: { selector: "#query", text: "sample" } },
    ...(includeExtraction ? [{
      key: "extract",
      definitionId: "web.output.dom-extract_list",
      definitionVersion: "1.0.0",
      parameters: { extractList: { item: ".item", fields: { name: ".name", price: ".price" }, minItems: 0 } }
    }] : []),
    { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
  ];
  return {
    schemaVersion: "0.1",
    router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes,
      edges: nodes.slice(0, -1).map((node, index) => ({
        key: `edge.${index + 1}`,
        source: { nodeKey: node.key, portId: index === 0 ? "next" : "success" },
        target: { nodeKey: nodes[index + 1]!.key, portId: "in" }
      }))
    }]
  };
}

function cannotAnswerCompletion(): JsonObject {
  return { kind: "complete", result: { summary: "Open and filter the catalog.", plan: recordsPlan(false) } };
}

function answeringCompletion(): JsonObject {
  return { kind: "complete", result: { summary: "Open, filter, and extract the catalog rows.", plan: recordsPlan(true) } };
}

export const RECORDS_INSTRUCTION = "Find every catalog item and give me rows with columns name and price.";

/**
 * The measured run's decisions, by the build's own count: six looks, a rerun,
 * two amendments, and at decision 10 a completion whose Flow reads no record.
 * Then looks, a rerun at 25 and the same completion at 26 -- or, with
 * `convergesAt`, the corrected completion that keeps the record producer.
 */
export function repeatedBuildReply(call: number, convergesAt?: number): Reply {
  if (call <= 6) return look(call);
  if (call === 7) return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { area: "area.rerun.7" } }] };
  if (call === 8 || call === 9) return { kind: "amend_draft", amendments: [{ step: 2, change: "optional" }] };
  if (call === 10) return cannotAnswerCompletion();
  if (call === convergesAt) return answeringCompletion();
  if (call <= 24) return look(call);
  if (call === 25) return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { area: "area.rerun.25" } }] };
  return cannotAnswerCompletion();
}

/** The judge's honest reading of a Flow that opens and filters the catalog but reads no row of it. */
export const JUDGE_NO: JudgeReply = {
  answersRequest: "no",
  expected: "Rows of every catalog item with columns name and price.",
  observed: "No step reads the catalog's items: the Flow opens and filters the catalog and stores no row.",
  changed: "Add a step that extracts each item's name and price as a list of rows after the filter."
};
