// Several answer-first attempts at one lending library, on one real service, with a scripted
// model: what the second attempt finds is what the first really left. By-hand calls answer through
// the fake binding (`./fake-library.ts`), and the engine's runs through real node implementations
// (`./fake-library-engine.ts`), both on the same library. A lending library is none of the Lab's
// realistic scenarios.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import { automationStudioActivityHub } from "../../../../../runtime/activity/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { automationStudioAnswerFirstAttemptPorts, automationStudioAnswerFirstAttemptStoreOf, automationStudioAnswerFirstRunActStoreOf, automationStudioAnswerFirstRunAgain, automationStudioAnswerFirstTaskMemoryOf } from "../index.ts";
import { libraryTarget, libraryTargetNodes, LOANS_OUTPUT, type LibraryTarget } from "./fake-library-engine.ts";
import { fakeLibraryBinding, LOOK_TOOL, READ_LOANS, runNode, toolCall, type FakeLibraryFault } from "./fake-library.ts";

export const TASK = "List every loan on my library account.";
const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };
const HANG_GUARD_MS = 90_000;

/** The read a Flow can run again: it keeps its rows through a record output. */
export const readLoans = (callId = "read", over: JsonObject = { add: true }): JsonObject => runNode(callId, READ_LOANS, { recordOutput: LOANS_OUTPUT }, [], over);

type Decision = JsonObject | ((request: AutomationStudioLlmTaskRequest) => JsonObject);

export type LaterAttemptOptions = {
  instruction?: string;
  flowId?: string;
  startLocation?: string;
  script?: readonly Decision[];
  /** The judge's replies in order, and past their end a yes. A function reads the judge's request, for a judge that weighs what it is shown. */
  judge?: readonly unknown[];
  permittedConsequences?: AutomationStudioActionConsequence[];
  /** The purse this attempt opens with. */
  maxTotalEstimatedCostUsd?: number;
  /** What one model call is priced at, for an attempt whose purse should end it. */
  costUsd?: number;
  /** Past the script's end the model keeps looking, for a purse to end it. */
  keepLooking?: boolean;
  /** The resolver's other extras, for a host whose limits refuse before any model call. */
  resolver?: { timeoutMs?: number };
  /** Started by a person's press of Run again on the task's answer (`../run-again/`), not by the words typed again. */
  runAgain?: boolean;
};

/** A Core that restarted: a new service over what an earlier lane left, on the same library. */
export type LaterAttemptsRestart = { dataDir: string; projectId: string; target: LibraryTarget; flows: readonly string[] };

/** One service and one library, to run attempts on one after another. */
export async function laterAttempts(cleanups: (() => Promise<void>)[], options: { fault?: FakeLibraryFault; titles?: readonly string[]; restart?: LaterAttemptsRestart; describe?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["describeCall"]>; domain?: (binding: AutomationStudioLlmEvidenceRuntimeBinding) => Partial<AutomationStudioLlmEvidenceRuntimeBinding> } = {}) {
  const dataDir = options.restart?.dataDir ?? await mkdtemp(path.join(os.tmpdir(), "fluxiq-later-attempts-"));
  const target = options.restart?.target ?? libraryTarget(options.titles);
  const current: { script: readonly Decision[]; judge: unknown[]; decided: number; keepLooking: boolean; stop?: () => void; costUsd?: number | undefined; resolver: { maxTotalEstimatedCostUsd?: number; timeoutMs?: number } } = { script: [], judge: [], decided: 0, keepLooking: false, resolver: {} };
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let resolved = 0;
  const scripted = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    requests.push(request);
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: USAGE };
    if (request.taskKind === "loop_verification") {
      const reply = current.judge.shift();
      return (typeof reply === "function" ? (reply as (asked: AutomationStudioLlmTaskRequest) => unknown)(request) : reply) ?? judgeReply("yes");
    }
    const next = current.script[current.decided] ?? toolCall(`look.${current.decided}`, LOOK_TOOL, {});
    if (current.decided >= current.script.length && !current.keepLooking) current.stop?.();
    current.decided += 1;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted.", decision: typeof next === "function" ? next(request) : next }, usage: USAGE };
  });
  const provider = { ...scripted, estimateCostUsd: (tokens: { inputTokens: number; outputTokens: number }) => current.costUsd ?? scripted.estimateCostUsd?.(tokens) ?? 0 };
  const faked = fakeLibraryBinding(target.library, options.fault);
  const binding = { ...faked, ...options.domain?.(faked) };
  /** Every by-hand call that reached the target, and where it was told to start from. */
  const seen: { toolId: string; startLocation: string | undefined }[] = [];
  const service = new AutomationStudioService({
    dataDir, llmProviderResolver: () => {
      resolved += 1;
      return { provider, ...current.resolver };
    },
    llmEvidenceRuntime: { ...binding, ...(options.describe ? { describeCall: options.describe } : {}), executeTool: async (call) => {
      seen.push({ toolId: call.toolId, startLocation: call.startLocation });
      return await binding.executeTool(call);
    } }
  });
  service.bindNativeNodeRuntime(libraryTargetNodes(target));
  automationStudioAnswerFirstAttemptPorts(service).sleep = async () => undefined;
  // A restarted lane closes first, since the lane it restarted removes the directory they share.
  if (options.restart) cleanups.unshift(async () => await service.close());
  else cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const project = options.restart ? { id: options.restart.projectId } : await service.createProject({ name: "Library", domainId: "library" });
  const flows = new Set<string>(options.restart?.flows ?? []);
  const owned = service as unknown as { projectPaths: AutomationStudioProjectPaths; flowPaths: AutomationStudioFlowPaths; projects: AutomationStudioProjectStore };
  const stores = { paths: owned.projectPaths, flows: owned.flowPaths, projects: owned.projects };
  const memory = automationStudioAnswerFirstTaskMemoryOf(service, stores);
  const said: string[] = [];
  const taskIds = new Map<string, string>();
  automationStudioActivityHub.subscribe((event) => { said.push(`${event.label ?? ""} | ${JSON.stringify(event.detail ?? null)}`); });

  const start = async (given: LaterAttemptOptions) => {
    const flowId = given.flowId ?? "flow.loans";
    if (!flows.has(flowId)) {
      await service.createFlow({ projectId: project.id, flowId, name: "Loans" });
      flows.add(flowId);
    }
    const now = Date.now();
    // The same goal keeps the Flow's digest, as the chat's own save does (`../../flow-bootstrap-commands/save-goal.ts`): a new time here would read as a person changing the Flow, and a proven Flow would never be applied.
    const held = await service.getFlowInstruction(project.id, "instruction.task").catch(() => undefined);
    if (held?.body !== (given.instruction ?? TASK) || (held?.scope as { flowId?: string } | undefined)?.flowId !== flowId) await service.saveFlowInstruction(project.id, {
      schemaVersion: "0.1", instructionId: "instruction.task", title: "The task", body: given.instruction ?? TASK,
      scope: { kind: "flow", projectId: project.id, flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
    });
    Object.assign(current, { script: given.script ?? [], judge: [...(given.judge ?? [])], decided: 0, keepLooking: given.keepLooking === true, costUsd: given.costUsd, resolver: { ...given.resolver, ...(given.maxTotalEstimatedCostUsd === undefined ? {} : { maxTotalEstimatedCostUsd: given.maxTotalEstimatedCostUsd }) } });
    let ranOut = false;
    current.stop = () => {
      ranOut = true;
      service.buildCancellation.cancel(project.id, flowId);
    };
    const firstRequest = requests.length;
    const resolvedBefore = resolved;
    const guard = setTimeout(() => service.buildCancellation.cancel(project.id, flowId), HANG_GUARD_MS);
    const generate = async (startLocation = given.startLocation) => await service.generateFlowBootstrapAdaptation({
      projectId: project.id, flowId, caller: caller(), evidenceGuided: true, authoringMode: "answer-first",
      permittedConsequences: given.permittedConsequences ?? [], ...(startLocation ? { startLocation } : {})
    });
    let pressed: string | undefined;
    const answered = given.runAgain ? await (async () => {
      const taskId = taskIds.get(given.instruction ?? TASK);
      if (!taskId) throw new Error("Run again needs an attempt at the task first");
      const press = await automationStudioAnswerFirstRunAgain(service, stores, { projectId: project.id, taskId, goalWords: async () => given.instruction ?? TASK }, async ({ startLocation }) => await generate(startLocation));
      if (!press.ok) throw new Error(`Run again was refused: ${press.say}`);
      pressed = press.attemptId;
      return await press.finished;
    })() : await generate();
    clearTimeout(guard);
    if (answered.status !== "answered") throw new Error(`expected an answer, got ${answered.status}`);
    const asked = requests.slice(firstRequest);
    if (answered.attempt?.taskId) taskIds.set(given.instruction ?? TASK, answered.attempt.taskId);
    return {
      answer: answered, flowId, ranOut,
      /** The attempt a press of Run again was answered with, at once. */
      pressed,
      /** How many times anything asked for a provider: a run's recovery or its result check would ask again. */
      providersResolved: resolved - resolvedBefore,
      /** Every request the model saw in this attempt, whatever its kind. */
      asked,
      decisions: asked.filter((request) => request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority"),
      judgeCalls: asked.filter((request) => request.taskKind === "loop_verification")
    };
  };

  return {
    service, target, said, seen, memory, projectId: project.id, stores,
    /** What a new service over the same data needs. */
    restart: (): LaterAttemptsRestart => ({ dataDir, projectId: project.id, target, flows: [...flows] }),
    attempt: start,
    /** What the task kept, once an attempt has said which task it is. */
    kept: async (instruction: string = TASK) => await memory.get(project.id, taskIds.get(instruction) ?? "task.none"),
    /** Changes what the task kept, as if an earlier attempt had left it so. */
    changeKept: async (change: Parameters<typeof memory.update>[2], instruction: string = TASK) => await memory.update(project.id, taskIds.get(instruction) ?? "task.none", change),
    /** The Flow's act record as it stands. */
    actsOn: async (flowId = "flow.loans") => await automationStudioAnswerFirstRunActStoreOf(service, stores).get(project.id, flowId),
    /** Every attempt kept on the Flow. */
    rows: async (flowId = "flow.loans") => await automationStudioAnswerFirstAttemptStoreOf(service, stores).list(project.id, flowId)
  };
}

/** What a round was told, in front of its evidence. */
export function toldTo(request: AutomationStudioLlmTaskRequest | undefined): JsonObject | undefined {
  const note = request?.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.attempt_note");
  return note?.value as JsonObject | undefined;
}
