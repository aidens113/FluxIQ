// `core.run_part`: the model's way to run a saved part of this project's library, now,
// with values, and get back what it handed over.
//
// **It runs through the one runner** a person's run uses, reached by a port, so nothing
// here decides anything about a page or a permission. The guard's refusal is an ordinary
// answer the model reads and picks again from, and its result is what the part handed
// back and where it stopped, never its steps' evidence: a model that wanted those steps
// would have explored them.
//
// **The gate and the ledger are the build's own.** Each lasting step of the part is put to
// the permission check the loop gave this call, the check `core.run_node` passes a domain.
// The acts that landed go to the build's ledger through `landed`, with where each sat, as
// a trial's do (`candidate-trial/landed-acts.ts`). The loop's gate also records one act per
// call from the last declaration it saw (`flow-bootstrap/action-permissions.ts`); so that a
// part's acts are not counted twice, the last thing this tool declares is the plain read it
// has become once its acts are handed over.
//
// **A repeat is refused in a build.** The same version with the same values, once it has
// landed something lasting, is answered `part.repeat_refused`: a build never does a lasting
// act twice while it builds. `done` holds what this build has run, across its briefs.
//
// **What it leaves in the draft is one step: the call, pinned at the version that ran**
// (`draft.ranWith`, read by `../draft-step.ts`), never the part's steps. So a task that ran a part
// keeps the part in its Flow, and that Flow goes on running what ran here when the part changes.
// It carries nothing to replay: running a part again is not a look at whether it can be.
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../components/automation/control-flow/index.ts";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../action-permission-requests/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import type { AutomationStudioHarnessOptionBundle } from "../../harness-options/index.ts";

export const AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID = "core.run_part";

/** What the runner answers the tool. `acts` are opaque here: they go to the ledger as they came. */
export type AutomationStudioLlmRunPartAnswer<Act> =
  | { refused: string; message: string }
  | {
    runId: string;
    status: string;
    outputs: Record<string, JsonValue>;
    stoppedAt?: { stepLabel: string; reason: string } | undefined;
    classes: readonly string[];
    landed: readonly Act[];
    partId: string;
    version: number;
    /** What the model should do instead, where this part as called could not work: it leaves no step in the draft, since a Flow holding it would stop there too. */
    instruction?: string | undefined;
  };

export type AutomationStudioLlmRunPartPort<Act> = {
  run(input: {
    projectId: string;
    partId: string;
    version?: number | undefined;
    inputs: Record<string, JsonValue>;
    permission: AutomationStudioActionPermissionCheck;
    signal?: AbortSignal | undefined;
    /** Whether this very run already landed something lasting in this build. */
    repeated(key: { partId: string; version: number }): boolean;
  }): Promise<AutomationStudioLlmRunPartAnswer<Act>>;
  /** The acts a run landed, for the build's ledger. Told only when there are some. */
  landed(acts: readonly Act[], runId: string): void;
};

const DESCRIPTION = [
  "Run a saved part of this project's library now, on the page as it stands, with the values it takes, and get back what it handed over.",
  "No model is attached and it costs no decision. Use it when a part's card says it does what you need next, instead of exploring those steps again; you are not shown its steps.",
  "It runs only on the part's own site, only where its start check holds, and only if each lasting thing it does is something you were allowed. Otherwise it answers why, nothing has happened, and you can look for yourself instead.",
  "Its answer is `outputs` by the part's output id, and `stoppedAt` where it did not finish: a step in plain words and why. A part that did something lasting does not do it a second time in this build with the same values."
].join(" ");

const INPUT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["partId"],
  properties: {
    partId: { type: "string", minLength: 1, description: "The part's id, copied exactly from its card." },
    version: { type: "integer", minimum: 1, description: "The version to run; the newest when left out." },
    inputs: { type: "object", description: "What the part is given, by the input ids its card lists." }
  }
};

/** Core's bundle holding `core.run_part` for one build. `done` outlives the bundle, so a brief sees what an earlier one ran. */
export function automationStudioLlmRunPartBundle<Act>(input: { port: AutomationStudioLlmRunPartPort<Act>; done: Set<string> }): AutomationStudioHarnessOptionBundle {
  return {
    schemaVersion: "0.1",
    options: [{
      toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID,
      description: DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
      effect: "mutate",
      availability: { kind: "both" },
      safety: { sideEffect: "mutate" }
    }],
    implementations: {
      [AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]: async (call) => {
        const asked = askedOf(call.value);
        if (!asked) return refusal("part.input_invalid", "Name a part by its partId, with inputs as an object of its input ids.");
        const answer = await input.port.run({
          projectId: call.projectId, ...asked, permission: call.permission, ...(call.signal ? { signal: call.signal } : {}),
          repeated: (key) => input.done.has(doneKey(key, asked.inputs))
        });
        if ("refused" in answer) return refusal(answer.refused, answer.message);
        if (answer.landed.length) {
          input.done.add(doneKey(answer, asked.inputs));
          input.port.landed(answer.landed, answer.runId);
        }
        // The acts are handed over; what the loop's gate records for this call is no act of its own (header).
        await call.permission({ consequences: [], control: { name: "a saved part" }, verb: "run", effect: "observe" });
        if (answer.instruction) return answered(answer);
        return { ...answered(answer), draft: { actionId: AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID, effect: "mutate", ranWith: { part: { partId: answer.partId, version: answer.version }, inputs: asked.inputs } } };
      }
    }
  };
}

function askedOf(value: JsonObject): { partId: string; version?: number; inputs: Record<string, JsonValue> } | undefined {
  const { partId, version, inputs } = value;
  if (Object.keys(value).some((key) => key !== "partId" && key !== "version" && key !== "inputs")) return undefined;
  if (typeof partId !== "string" || !partId) return undefined;
  if (version !== undefined && (typeof version !== "number" || !Number.isInteger(version) || version < 1)) return undefined;
  if (inputs !== undefined && (typeof inputs !== "object" || inputs === null || Array.isArray(inputs))) return undefined;
  return { partId, ...(version !== undefined ? { version } : {}), inputs: { ...(inputs ?? {}) } };
}

/** One run of one version: its values in a fixed order, so the same values read the same. */
function doneKey(key: { partId: string; version: number }, inputs: Record<string, JsonValue>): string {
  const sorted = Object.keys(inputs).sort().map((id) => [id, inputs[id]]);
  return JSON.stringify([key.partId, key.version, sorted]);
}

function answered(answer: Exclude<AutomationStudioLlmRunPartAnswer<unknown>, { refused: string }>): AutomationStudioLlmEvidenceToolExecutionResult {
  const finished = answer.status === "succeeded";
  const evidence: JsonObject = {
    ok: finished, status: answer.status, outputs: answer.outputs, acts: [...answer.classes],
    ...(answer.stoppedAt ? { stoppedAt: { step: answer.stoppedAt.stepLabel, reason: answer.stoppedAt.reason } } : {}),
    ...(answer.instruction ? { instruction: answer.instruction } : {})
  };
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, resultCode: finished ? "core.run_part.ran" : "core.run_part.stopped" };
}

/** A refusal the model can act on, shaped as Core's own tools refuse. Nothing happened. */
function refusal(code: string, instruction: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}
