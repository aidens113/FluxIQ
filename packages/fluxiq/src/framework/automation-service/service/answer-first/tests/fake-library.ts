// A generic stub target for real-service tests of an answer-first attempt: a lending library's
// account, a kind of site none of the Lab's realistic scenarios is. It counts what is pressed,
// so a test can say a row was acted on once, and it records every call, so a test can say what
// never happened. `scriptedAttempt` drives one attempt through the real service with a scripted
// model. Extend it with what a test needs: `script` is the model, `over` the service's options.

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import { automationStudioActivityHub } from "../../../../../runtime/activity/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

export const READ_LOANS = "domain.library.read_loans";
export const RENEW_LOAN = "domain.library.renew_loan";
export const RENEW_CARD = "domain.library.renew_card";
export const LOOK_TOOL = "library.look";

const node = (id: string, label: string, over: Partial<AutomationStudioNodeDefinition>): AutomationStudioNodeDefinition => ({
  schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label}.`, category: "action",
  source: { kind: "importer", domainId: "library", packageId: "library.package", implementationKey: id },
  availability: { kind: "domain", domainId: "library" }, requiredRuntimeCapabilities: ["library.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "title", label: "Title", valueType: "string", required: false }],
  safety: { requiredPermissions: [] },
  ...over
});

const NODES: AutomationStudioNodeDefinition[] = [
  node(READ_LOANS, "Read loans", { outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }], parameters: [{ id: "shape", label: "Shape", valueType: "string", required: false }] }),
  node(RENEW_LOAN, "Renew loan", { inputs: [{ id: "in", label: "In", valueType: "any", required: false }, { id: "item", label: "Item", valueType: "any", required: false }] }),
  node(RENEW_CARD, "Renew card", { parameters: [] })
];

/** A library's state, and the record of everything done to it. */
export type FakeLibrary = {
  loans: { title: string; due: string }[];
  /** How many times each loan, or `card`, was renewed. */
  renewals: Record<string, number>;
  calls: { toolId: string; value: JsonObject }[];
  /** What a look shows beyond the renewal count: move it to change the page by itself. */
  shelf: string;
  /** How a read given `shape` writes each row: a Flow's own columns, where its read is not the read that explored. */
  shapes?: Record<string, (loan: { title: string; due: string }) => JsonObject>;
  /** A renewal moves the loan's due date to this, as a real site's row changes under the act that landed on it. */
  renewedUntil?: string;
  /** The address a read says it read, as a real domain's does. Absent, a read says none. */
  address?: string;
  /** Whether the account's hold shelf is on: a control a press flips each time, and a toggle site's Save in small. */
  onHold?: boolean;
};

export function fakeLibrary(titles: readonly string[] = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]): FakeLibrary {
  return { loans: titles.map((title, index) => ({ title, due: `2030-01-0${index + 1}` })), renewals: {}, calls: [], shelf: "open" };
}

function isReset(value: JsonObject): boolean {
  return value.replay === "reset";
}

/** A call the target answers its own way, or throws on: nothing, and it answers as a library does. */
export type FakeLibraryFault = (call: { toolId: string; value: JsonObject }, library: FakeLibrary) => AutomationStudioLlmEvidenceToolExecutionResult | Promise<AutomationStudioLlmEvidenceToolExecutionResult> | undefined;

/** The domain: a free look, and a library of three nodes that act on the state above. */
export function fakeLibraryBinding(library: FakeLibrary, fault?: FakeLibraryFault): AutomationStudioLlmEvidenceRuntimeBinding {
  // Each call says the state it found and left, as a real domain's does: the loop's guards judge only what they can name.
  const stated = async (call: Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0]): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    const before = stateOf(library);
    const answered = await answerOf(library, fault, call);
    return { ...answered, stateDigests: { before, after: stateOf(library) } };
  };
  return {
    domainId: "library",
    deniedEvidenceKeys: [],
    readRowsKey: "read.extracted",
    observedStateKeys: ["page"],
    tools: [{ toolId: LOOK_TOOL, description: "Look at the account page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    resolvePlanNodeParameters: ({ parameters }) => ({ status: "resolved", parameters }),
    executeTool: stated
  };
}

async function answerOf(library: FakeLibrary, fault: FakeLibraryFault | undefined, { toolId, value, permission }: Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0]): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  library.calls.push({ toolId, value: structuredClone(value) });
  const faulted = fault?.({ toolId, value }, library);
  if (faulted) return faulted;
  if (toolId === LOOK_TOOL) return answer({ page: page(library) }, { actionId: LOOK_TOOL, effect: "observe", proposes: false });
  const nodeId = String(value.node);
  const ran = { node: nodeId, parameters: (value.parameters ?? {}) as JsonObject, consequences: (value.consequences ?? []) as string[] };
  const draft = { actionId: nodeId, input: value, ranWith: ran, replay: { from: { location: "library://account" } }, proposes: true };
  if (value.replay === "verify") return { kind: "llm_evidence_tool_execution", evidence: { page: page(library) }, effectApplied: false, resultCode: "core.replay.verified" };
  if (isReset(value)) return { kind: "llm_evidence_tool_execution", evidence: { reset: true }, effectApplied: false, resultCode: "core.replay.replayed" };
  const code = value.replay === "step" ? { resultCode: "core.replay.replayed" } : {};
  if (value.write === true) return { ...answer({ written: true }, { ...draft, written: true, effect: nodeId === READ_LOANS ? "observe" : "mutate" }), resultCode: "core.run_node.written" };
  const rows = (): JsonObject[] => library.loans.map((loan) => library.shapes?.[String(ran.parameters.shape)]?.(loan) ?? { ...loan });
  if (nodeId === READ_LOANS) return { ...answer({ read: { extracted: rows(), ...(library.address === undefined ? {} : { url: library.address }) }, page: page(library) }, { ...draft, effect: "observe" }, true), outputs: { records: rows() }, ...code };
  const declared = ran.consequences;
  if (declared.length && permission) {
    const verdict = await permission({ consequences: declared as AutomationStudioActionConsequence[], control: { name: nodeId === RENEW_CARD ? "Renew card" : `Renew ${String(ran.parameters.title ?? "a loan")}`, kind: "button" }, verb: "press" });
    if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required", declined: verdict.declined === true }, effectApplied: false, resultCode: "permission_required", draft: { ...draft, effect: "mutate" } };
  }
  const row = (value.item ?? {}) as JsonObject;
  const subject = nodeId === RENEW_CARD ? "card" : loanTitle(library, String(row.title ?? ran.parameters.title ?? ""));
  library.renewals[subject] = (library.renewals[subject] ?? 0) + 1;
  const renewed = library.renewedUntil === undefined ? undefined : library.loans.find((loan) => loan.title === subject);
  if (renewed) renewed.due = library.renewedUntil!;
  return { ...answer({ ok: true, actedOn: subject, pageChanged: true, page: page(library) }, { ...draft, effect: "mutate" }, true), ...code };
}

/** The loan a press names, however a Flow's row wrote its title: cut short, or in another case. */
function loanTitle(library: FakeLibrary, named: string): string {
  const said = named.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return library.loans.find((loan) => loan.title === named)?.title ?? library.loans.find((loan) => said.length > 0 && (loan.title.toLowerCase().startsWith(said) || said.includes(loan.title.toLowerCase())))?.title ?? named;
}

function stateOf(library: FakeLibrary): string {
  return createHash("sha256").update(JSON.stringify(page(library))).digest("hex").slice(0, 32);
}

function page(library: FakeLibrary): JsonObject {
  return { heading: "Your account", shelf: library.shelf, renewed: Object.values(library.renewals).reduce((sum, times) => sum + times, 0) };
}

function answer(evidence: JsonObject, draft: NonNullable<AutomationStudioLlmEvidenceToolExecutionResult["draft"]>, effectApplied = false): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied, draft };
}

/** The node runtime the fake's nodes are registered in. */
export function fakeLibraryNodes(): AutomationStudioNativeNodeRuntime {
  const success = () => ({ status: "success" as const, route: "success", outputs: { success: true } });
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["library.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "library.package", packageVersion: "1.0.0", domainId: "library", nodes: NODES },
    { packageId: "library.package", packageVersion: "1.0.0", implementations: Object.fromEntries(NODES.map((each) => [each.id, success])) }
  );
}

/** One scripted decision, as a model would answer it. */
export const toolCall = (callId: string, toolId: string, input: JsonObject, over: JsonObject = {}): JsonObject => ({ kind: "tool_call", callId, toolId, input, ...over });
export const runNode = (callId: string, nodeId: string, parameters: JsonObject = {}, consequences: string[] = [], over: JsonObject = {}): JsonObject => toolCall(callId, "core.run_node", { node: nodeId, parameters, consequences }, over);
export const complete = (summary = "Done.", answerWords?: string): JsonObject => ({ kind: "complete", result: { summary, ...(answerWords === undefined ? {} : { answer: answerWords }) } });

const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };

export type ScriptedAttemptOptions = {
  library?: FakeLibrary;
  instruction?: string;
  /**
   * The model's decisions in order; a function sees the request. Past its end the attempt is
   * stopped, as a person would, and `scriptRanOut` says so: nothing ends an attempt but a
   * result, a budget or a Stop, so a script that ran out would otherwise spend its whole purse.
   */
  script: ReadonlyArray<JsonObject | ((request: AutomationStudioLlmTaskRequest) => JsonObject)>;
  /** The judge's answers in order, and past their end a yes. */
  judge?: readonly unknown[];
  /** Past the script's end the model keeps looking, for a test whose purse is meant to end it. */
  keepLooking?: boolean;
  usage?: typeof USAGE;
  permittedConsequences?: AutomationStudioActionConsequence[];
  /** Replaces the scripted provider's call, for a test of a provider that is silent or refuses. */
  wrapProvider?: (provider: AutomationStudioLlmProvider, requests: AutomationStudioLlmTaskRequest[]) => AutomationStudioLlmProvider;
  /** The resolver's extras: a total, or a per-call limit. */
  resolver?: { maxTotalEstimatedCostUsd?: number; maxCallsPerRun?: number; timeoutMs?: number; tokenLimits?: { maxInputTokens: number; maxOutputTokens: number; maxTotalTokens: number } };
  over?: Partial<AutomationStudioServiceOptions>;
  /** Called with the service before the attempt, to set ports (`../attempt/ports.ts`). */
  before?: (service: AutomationStudioService, project: { projectId: string; flowId: string }) => void | Promise<void>;
  /** A call the target answers its own way, or throws on. */
  fault?: FakeLibraryFault;
  /** What the model says of each decision, which the chat shows: its summary, in place of a plain word. */
  saying?: string;
  /** The Flow is given no instruction: nothing has been asked yet. */
  noInstruction?: boolean;
};

/** How long an attempt may take before the test stops it as a person would: nothing else can end one, and the test's own clock does not. */
const HANG_GUARD_MS = 90_000;
/** How many decisions it may ask for, for the same reason. */
const MOST_DECISIONS = 400;

/** One attempt through the real service, with a scripted model and the fake target. */
export async function scriptedAttempt(options: ScriptedAttemptOptions, cleanups: (() => Promise<void>)[]) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-answer-first-"));
  const library = options.library ?? fakeLibrary();
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const judged = [...(options.judge ?? [])];
  let decided = 0;
  const ran = { out: false, hung: false };
  let ids: { projectId: string; flowId: string } | undefined;
  const stopHung = (): void => {
    ran.hung = true;
    if (ids) service.buildCancellation.cancel(ids.projectId, ids.flowId);
  };
  const said: string[] = [];
  const stopListening = automationStudioActivityHub.subscribe((event) => { said.push(`${event.label ?? ""} | ${JSON.stringify(event.detail ?? null)}`); });
  const guard = setTimeout(stopHung, HANG_GUARD_MS);
  const scripted = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    requests.push(request);
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: options.usage ?? USAGE };
    if (request.taskKind === "loop_verification") return judged.shift() ?? judgeReply("yes");
    const next = options.script[decided] ?? toolCall(`look.${decided}`, LOOK_TOOL, {});
    if (decided >= options.script.length && !options.keepLooking && ids) {
      ran.out = true;
      service.buildCancellation.cancel(ids.projectId, ids.flowId);
    }
    if (decided >= MOST_DECISIONS) stopHung();
    decided += 1;
    return { response: { kind: "evidence_tool_decision", summary: options.saying ?? "Scripted.", decision: typeof next === "function" ? next(request) : next }, usage: options.usage ?? USAGE };
  });
  const provider = options.wrapProvider ? options.wrapProvider(scripted, requests) : scripted;
  const service = new AutomationStudioService({
    dataDir,
    llmProviderResolver: () => ({ provider, ...(options.resolver ?? {}) }),
    llmEvidenceRuntime: fakeLibraryBinding(library, options.fault),
    ...(options.over ?? {})
  });
  service.bindNativeNodeRuntime(fakeLibraryNodes());
  cleanups.push(async () => {
    clearTimeout(guard);
    stopListening();
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const project = await service.createProject({ name: "Library", domainId: "library" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.loans", name: "Loans" });
  const now = Date.now();
  if (!options.noInstruction) await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.task", title: "The task", body: options.instruction ?? "List every loan on my library account.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });
  ids = { projectId: project.id, flowId: flow.flowId };
  await options.before?.(service, ids);
  const answered = await service.generateFlowBootstrapAdaptation({
    projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "answer-first",
    permittedConsequences: options.permittedConsequences ?? []
  });
  clearTimeout(guard);
  stopListening();
  return { service, dataDir, library, requests, answered, said, projectId: project.id, flowId: flow.flowId, scriptRanOut: ran.out, hung: ran.hung };
}
