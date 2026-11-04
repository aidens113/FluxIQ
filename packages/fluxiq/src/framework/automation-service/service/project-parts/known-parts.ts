// Offering the library to a task: the shortlist in the opening look, and `core.run_part`
// beside it. One rule for both: **the tool is offered only when the shortlist is not empty.**
// A project with no part that can be offered gets nothing added, no extra tool, no extra
// evidence and not one more byte in a request, and pays nothing for the library.
//
// Decided once at the task's start, from the person's words, where it starts and the lasting
// classes they allowed. A match only ever produces an offer: nothing here runs a part.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID,
  AutomationStudioHarnessOptionRegistry,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioHarnessOptionLoopBinding,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../../../runtime/llm/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../../../runtime/llm/evidence-loop/index.ts";
import type { AutomationStudioAttemptActRecord } from "../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioKnownParts } from "../../../../runtime/project-parts/index.ts";
import type { AutomationStudioNodeRegistryResolution } from "../../nodes/index.ts";
import type { AutomationStudioProjectParts } from "./project-parts.ts";
import { automationStudioProjectBuildRunPartBundle } from "./run/index.ts";

type Shortlisting = Pick<AutomationStudioProjectParts, "shortlist">;

/** What the shortlist of a project build is read from. */
type BuildOffer = {
  parts?: Shortlisting | undefined;
  instructions: readonly { body: string; status?: string | undefined }[];
  permissions: { permittedConsequences?: readonly string[] | undefined };
};

const builds = new WeakMap<object, Promise<AutomationStudioKnownParts | undefined>>();

/**
 * The shortlist of a project build, read once for the build (whoever asks first starts it); it never rejects, since the library's own read does not:
 * the supervisor's `project.read_task` shows it, and the briefs' tools are offered by it (`../project-build/brief-ports.ts`).
 */
export function automationStudioProjectBuildKnownParts(project: BuildOffer, build: { projectId: string; startLocation: string | undefined }): Promise<AutomationStudioKnownParts | undefined> {
  const { parts } = project;
  if (!parts) return Promise.resolve(undefined);
  let known = builds.get(project);
  if (!known) {
    known = parts.shortlist({
      projectId: build.projectId,
      requestWords: project.instructions.filter((instruction) => instruction.status === undefined || instruction.status === "active").map((instruction) => instruction.body).join("\n"),
      startLocation: build.startLocation,
      askedClasses: project.permissions.permittedConsequences ?? []
    });
    builds.set(project, known);
  }
  return known;
}

/** What an answer-first attempt's input holds that the offer reads and changes. */
type AttemptOffer = {
  projectId: string;
  flowId: string;
  instructionText: string;
  startLocation: string | undefined;
  resolution: AutomationStudioNodeRegistryResolution;
  parts?: (Shortlisting & Pick<AutomationStudioProjectParts, "runAs">) | undefined;
  permissionGround: { permittedConsequences?: readonly string[] | undefined };
  harnessOptions: AutomationStudioHarnessOptionLoopBinding;
  continuingOptions(): AutomationStudioHarnessOptionLoopBinding;
  partActs?: AutomationStudioAnswerFirstPartActs | undefined;
};

/** Where an attempt hands the library its act record, once it has made one. Nothing runs a part before that. */
export type AutomationStudioAnswerFirstPartActs = { use(record: Pick<AutomationStudioAttemptActRecord, "settled">): void };

/**
 * The attempt's input with the library offered, or the same input untouched when nothing can be offered
 * (or the library cannot be read, which reads as none). The first look of the first round carries the shortlist as `knownParts`, and
 * the tool list gains `core.run_part` in every round. The opening look's own call and every other tool are unchanged.
 *
 * A part a run lands acts through is held to one run per version and values for the attempt, as a build holds it (`done`).
 * The attempt's act record is told each of its lasting steps with the node's own action, parameters and row, as it happens, so
 * the first real run of that part knows them when it reaches the same step (`../answer-first/run-acts/run-gate.ts`).
 */
export async function automationStudioAnswerFirstKnownParts<Input extends AttemptOffer>(input: Input): Promise<Input> {
  const { parts } = input;
  if (!parts) return input;
  const known = await parts.shortlist({
    projectId: input.projectId,
    requestWords: input.instructionText,
    startLocation: input.startLocation,
    askedClasses: input.permissionGround.permittedConsequences ?? []
  });
  if (!known) return input;
  let record: Pick<AutomationStudioAttemptActRecord, "settled"> | undefined;
  const bundle = automationStudioProjectBuildRunPartBundle({
    parts, permittedConsequences: input.permissionGround.permittedConsequences ?? [], done: new Set(), landed: () => undefined,
    // The words are left to the record, which says an act by its class: a step's label may hold page text.
    settled: (call, outcome) => { record?.settled({ ...call, stage: "exploration" }, { ...outcome, words: { what: "", where: "" } }); }
  });
  const offering = (base: AutomationStudioHarnessOptionLoopBinding) => withRunPart(base, bundle, { projectId: input.projectId, flowId: input.flowId, resolution: input.resolution });
  let told = false;
  const first = offering(input.harnessOptions);
  return {
    ...input,
    harnessOptions: {
      ...first,
      executeTool: async (call) => {
        const answer = await first.executeTool(call);
        if (told || !isOpeningCall(call.callId)) return answer;
        const shown = withKnownParts(answer, known);
        told = shown !== answer;
        return shown;
      }
    },
    continuingOptions: () => offering(input.continuingOptions()),
    partActs: { use: (made) => { record = made; } }
  };
}

/** The binding as it was, with `core.run_part` beside its tools and its calls routed to the library's bundle. */
function withRunPart(base: AutomationStudioHarnessOptionLoopBinding, bundle: AutomationStudioHarnessOptionBundle, scope: { projectId: string; flowId: string; resolution: AutomationStudioNodeRegistryResolution }): AutomationStudioHarnessOptionLoopBinding {
  const registry = new AutomationStudioHarnessOptionRegistry();
  registry.register(bundle);
  const part = registry.evidenceLoopBinding({ projectId: scope.projectId, flowId: scope.flowId }, { ...scope.resolution, allowSideEffectsWithoutPolicy: true });
  return {
    ...base,
    tools: [...base.tools, ...part.tools.filter((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID)],
    executeTool: (call) => (call.toolId === AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID ? part.executeTool(call) : base.executeTool(call))
  };
}

/** The answer of a look with the shortlist beside what it found; any other answer, and a look that was refused, as it was. */
function withKnownParts(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult, known: AutomationStudioKnownParts): JsonValue | AutomationStudioLlmEvidenceToolExecutionResult {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer) || answer.kind !== "llm_evidence_tool_execution") return answer;
  const execution = answer as AutomationStudioLlmEvidenceToolExecutionResult;
  const evidence = execution.evidence;
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence) || evidence.ok === false) return answer;
  return { ...execution, evidence: { ...(evidence as JsonObject), knownParts: known as unknown as JsonObject } };
}
