import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS, AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "./tool-ids.ts";

const TEXT = { type: "string" } as const;
const TEXTS = { type: "array", items: TEXT } as const;

const EFFECT: JsonObject = {
  type: "object",
  description: "Optional. The change this part asks for, as data. kind change: direction adds or removes, count a whole number from 1 to 1000 or \"each_match\" where the request names a condition and no number, and what is the thing changed; it is judged by the difference between the state before the run and the state after it (placing holds on 2 books is change, adds, 2, \"holds on books\"). kind end_state: state is what must hold after the run; it is judged by the state after the run alone (setting the reading-room alert to email is end_state, \"the reading-room alert is email\"). adds needs create_new or modify_existing in lastingActs, removes needs delete or modify_existing, end_state needs modify_existing. A part that only reads or opens something declares none.",
  properties: { kind: { type: "string", enum: ["change", "end_state"] }, direction: { type: "string", enum: ["adds", "removes"] }, count: { type: ["integer", "string"] }, what: TEXT, state: TEXT },
  required: ["kind"],
  additionalProperties: false
};

/**
 * How many rows a part's answer asks for (framework plan K2,
 * `../contracts/task-spec.ts`): optional, and generic in its words; its example
 * is a library's, as every example the supervisor is shown is.
 */
const ANSWER_ROWS: JsonObject = {
  type: "object",
  description: "Optional. How many rows the answer asks for, where the person's words say a number: count for exactly that many, or atLeast, atMost or both for a range, each a whole number from 1 to 10000, never count beside atLeast or atMost "
    + "(the 5 newest books is {count: 5}; at least 3 reviews is {atLeast: 3}; up to 10 titles is {atMost: 10}). Leave it out where the words give no number of rows.",
  properties: { count: { type: "integer" }, atLeast: { type: "integer" }, atMost: { type: "integer" } },
  additionalProperties: false
};

const ANSWER: JsonObject = { type: "object", properties: { kind: { type: "string", enum: ["records"] }, columns: TEXTS, rows: ANSWER_ROWS }, required: ["kind", "columns"], additionalProperties: false };

const PLAN_INPUT: JsonObject = {
  type: "object",
  properties: {
    taskSpec: {
      type: "object",
      properties: {
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: TEXT,
              quote: { type: "object", properties: { sourceId: TEXT, text: TEXT }, required: ["sourceId", "text"], additionalProperties: false },
              goalFacts: TEXTS,
              lastingActs: { type: "array", items: { type: "string", enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES] } },
              answer: ANSWER,
              effect: EFFECT
            },
            required: ["id", "quote", "goalFacts", "lastingActs"],
            additionalProperties: false
          }
        },
        notAsked: TEXTS,
        unchanged: { type: "array", maxItems: 20, items: TEXT, description: "Optional. Things that must show no change, judged relative to the state before the run, for example leave other holds as they are is \"other holds\"." }
      },
      required: ["parts"],
      additionalProperties: false
    },
    // The planning format (`./plan-input.ts`): Core writes the structure plan from it.
    subflows: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: { key: TEXT, name: TEXT, purpose: TEXT, parts: TEXTS, inputs: TEXTS, outputs: TEXTS, after: TEXTS },
        required: ["key", "name", "parts"],
        additionalProperties: false
      }
    },
    reason: TEXT
  },
  required: ["taskSpec", "subflows"],
  additionalProperties: false
};

const BRIEF_INPUT: JsonObject = {
  type: "object",
  properties: {
    kind: { type: "string", enum: AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS.filter((kind) => kind !== "survey") },
    subflowKey: TEXT,
    parts: TEXTS,
    entry: { type: "object", properties: { caseId: TEXT, predecessors: TEXTS }, additionalProperties: false },
    // Core sizes each brief and permits its parts' acts (`./brief-sizing.ts`, t570): these only lower its share.
    allowanceUsd: { type: "number" },
    maxIterations: { type: "integer" },
    recordingExcerpt: TEXT,
    // A repair's failing trial: one entry of an earlier return's `trials`, copied whole (`./dispatch-tool.ts`, t588).
    failingReceipt: {
      type: "object",
      properties: { kind: { type: "string", enum: [...AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS] }, receiptId: TEXT, digest: TEXT },
      required: ["kind", "receiptId", "digest"],
      additionalProperties: false
    }
  },
  required: ["kind", "subflowKey"],
  additionalProperties: false
};

/**
 * The supervisor's own tools, as the loop offers them (descriptions in
 * `./guidance.ts`). Dispatching and testing act on the target -- builders and
 * the trial run there -- so both are `mutate`, and the loop's repeat guard
 * never answers either from memory. `project.read_task` is the opening look,
 * run before the first decision with no provider call. A brief is never a
 * survey: the dispatcher does not run one yet (A5b), so the supervisor's own
 * look is the observe-only tools.
 */
export function automationStudioProjectSupervisorTools(): AutomationStudioLlmEvidenceTool[] {
  return [
    { toolId: IDS.readTask, effect: "observe", description: GUIDANCE.tools.readTask, inputSchema: { type: "object", properties: {}, additionalProperties: false }, initialObservation: { input: {} } },
    { toolId: IDS.writePlan, effect: "observe", description: GUIDANCE.tools.writePlan, inputSchema: PLAN_INPUT },
    { toolId: IDS.amendPlan, effect: "observe", description: GUIDANCE.tools.amendPlan, inputSchema: { ...PLAN_INPUT, required: ["taskSpec", "subflows", "reason"] } },
    { toolId: IDS.dispatch, effect: "mutate", description: GUIDANCE.tools.dispatch, inputSchema: { type: "object", properties: { reason: TEXT, briefs: { type: "array", minItems: 1, maxItems: 20, items: BRIEF_INPUT } }, required: ["reason", "briefs"], additionalProperties: false } },
    { toolId: IDS.assemble, effect: "observe", description: GUIDANCE.tools.assemble, inputSchema: { type: "object", properties: { summary: TEXT }, additionalProperties: false } },
    {
      toolId: IDS.testCandidate,
      effect: "mutate",
      description: GUIDANCE.tools.testCandidate,
      inputSchema: { type: "object", properties: { revision: { type: "integer" }, digest: TEXT }, required: ["revision", "digest"], additionalProperties: false }
    }
  ];
}
