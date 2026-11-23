// The model belongs to task identity, not one attempt or one role. Only its public id is persisted.
import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../../../../runtime/models/catalog/index.ts";
import type { AutomationStudioLlmProvider } from "../../../../../runtime/llm/harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../../../../runtime/llm/index.ts";
import { automationStudioLlmRoleRoutedResolution } from "../../../../../runtime/llm/role-routing/index.ts";
import { automationStudioAnswerFirstTaskWords } from "../attempt/index.ts";
import { automationStudioAnswerFirstCarryOnScope } from "../carry-on/index.ts";
import { automationStudioAnswerFirstRunAgainScope } from "../run-again/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { AutomationStudioAnswerFirstTaskMemoryIntegrityError, automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../task-memory/index.ts";

type Resolved = AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

/** A same-task continuation keeps its model; a distinct task identity can make a new explicit choice. */
export async function automationStudioAnswerFirstModelResolution<Result extends Resolved>(input: {
  authoringMode: string | undefined;
  owner: object;
  stores: AutomationStudioAnswerFirstTaskMemoryPorts;
  request: AutomationStudioLlmProviderResolverInput;
  resolver: (request: AutomationStudioLlmProviderResolverInput) => Result | Promise<Result>;
  instructionText: string;
  activeInstructions?: Parameters<typeof automationStudioAnswerFirstTaskWords>[0]["activeInstructions"];
  startLocation?: string | undefined;
  callerKey?: string | undefined;
  scoped?: boolean | undefined;
}): Promise<Result | undefined> {
  if (input.authoringMode !== "answer-first") return await automationStudioLlmRoleRoutedResolution(input.resolver, input.request);
  const { projectId, flowId } = input.request;
  const carry = automationStudioAnswerFirstCarryOnScope.getStore();
  const again = automationStudioAnswerFirstRunAgainScope.getStore();
  const held = [carry, again].find((scope) => scope && !scope.opened && scope.projectId === projectId && scope.flowId === flowId);
  const taskId = held?.taskId ?? automationStudioAnswerFirstTaskKey({ instructionText: automationStudioAnswerFirstTaskWords(input), startLocation: input.startLocation, callerKey: input.callerKey });
  const memory = automationStudioAnswerFirstTaskMemoryOf(input.owner, input.stores);
  const options = { scoped: input.scoped === true };
  // Unscoped task memory is best effort, as the attempt's opening reads it: a store that cannot be read or
  // written costs no result. A stored value Core refuses is not a failed store and still stops the task.
  // Scoped execution state stays strict, since forgetting it could repeat a lasting act.
  const tolerated = async <T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      if (options.scoped || error instanceof AutomationStudioAnswerFirstTaskMemoryIntegrityError) throw error;
      return { ok: false };
    }
  };
  const read = await tolerated(() => memory.get(projectId, taskId, options));
  const kept = read.ok ? read.value : undefined;
  // Only an original explicit caller choice is safe historical evidence. Later calls may have escalated.
  const original = kept?.attempts.find((attempt) => attempt.ordinal === 1)?.caller?.model;
  const defaultModel = AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL
    : input.request.providerId === "deepseek" ? "deepseek-flash" : "claude-haiku-5-5";
  const selected = kept?.startingModel ?? original ?? (kept?.attempts.length ? defaultModel : undefined);
  if (selected !== undefined && !validModel(selected)) throw new Error("The task starting model is invalid.");
  const resolve = async (model: string) => {
    const result = await input.resolver({ ...input.request, modelId: model });
    if (result && modelOf(result) !== model) throw new Error("The provider resolved a different model than the task's starting model.");
    return result;
  };
  const resolved = selected === undefined ? await automationStudioLlmRoleRoutedResolution(input.resolver, input.request) : await resolve(selected);
  if (!resolved) return resolved;
  const model = modelOf(resolved);
  if (!validModel(model)) throw new Error("The provider returned an invalid starting model id.");
  // Existing store transaction/lock chooses one winner. Never overwrite another continuation's selection.
  const written = await tolerated(() => memory.update(projectId, taskId, (current) => ({ ...current, startingModel: current.startingModel ?? model }), options));
  if (!written.ok) return resolved;
  const winner = written.value;
  return winner.startingModel === model ? resolved : await resolve(winner.startingModel!);
}

function modelOf(result: Exclude<Resolved, undefined>): string {
  return "provider" in result ? result.provider.metadata.model : result.metadata.model;
}

function validModel(value: unknown): value is string {
  return typeof value === "string" && MODEL_ID.test(value);
}
