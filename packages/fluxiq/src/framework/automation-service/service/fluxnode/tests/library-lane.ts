// FluxNode runs on the lending library (`../../answer-first/tests/fake-library.ts`), a kind of site none
// of the Lab's realistic scenarios is: one real service with a scripted model, and the FluxNode service
// over it, as a server builds it. The library gains one node a FluxNode needs: "Find loans" by a title,
// a read whose rows depend on its parameter, at both doors -- by hand (the attempt's exploration) and
// through the engine (a saved Flow's replay) -- so a replay with another input finds other rows.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FluxNodeEventAnswer, FluxNodeRunEvent, FluxNodeRunRequest, FluxNodeRunResult, FluxNodeRunStateBody, FluxNodeSpecInput } from "@fluxiq/contracts/fluxnode";
import { parseFluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { caller as modelCaller, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioAnswerFirstAttemptPorts } from "../../answer-first/index.ts";
import { fakeLibrary, fakeLibraryBinding, judgedYes, LOOK_TOOL, runNode, toolCall, type FakeLibrary } from "../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../answer-first/tests/fake-library-engine.ts";
import { createFluxNodeService, type FluxNodeCaller, type FluxNodeService } from "../index.ts";

export const FIND_LOANS = "domain.library.find_loans";
export const OWNER: FluxNodeCaller = { principal: "owner", policy: "FluxNodeRunner", via: "open_mode" };
const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };
const LOCATION = { from: { location: "library://account" } };
const RUN_GUARD_MS = 90_000;

const FIND_NODE: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: FIND_LOANS, version: "1.0.0", label: "Find loans", description: "Find the loans whose title has the words given.", category: "action",
  source: { kind: "importer", domainId: "library", packageId: "library.find", implementationKey: FIND_LOANS },
  availability: { kind: "domain", domainId: "library" }, requiredRuntimeCapabilities: ["library.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }],
  parameters: [{ id: "title", label: "Title", valueType: "string", required: false }, { id: "recordOutput", label: "Record output", valueType: "object", required: false }],
  safety: { requiredPermissions: [] }
};

/** The loans whose title has `words`, as a read shows them. */
export function loansWith(library: FakeLibrary, words: unknown): JsonObject[] {
  const wanted = String(words ?? "").toLowerCase();
  return library.loans.filter((loan) => loan.title.toLowerCase().includes(wanted)).map((loan) => ({ title: loan.title, due: loan.due }));
}

/** A model's decision to find loans by hand, keeping its rows through a record output a Flow can run again. */
export const findLoans = (title: string, callId = "find"): JsonObject => runNode(callId, FIND_LOANS, { title, recordOutput: LOANS_OUTPUT }, [], { add: true });

type Decision = JsonObject | ((request: AutomationStudioLlmTaskRequest) => JsonObject);

export type FluxNodeLane = Awaited<ReturnType<typeof fluxNodeLane>>;

/** One service on one library, with the FluxNode service over it. */
export async function fluxNodeLane(cleanups: (() => Promise<void>)[], options: { personWaitMs?: number } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-fluxnode-"));
  const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
  const current: { script: readonly Decision[]; judge: unknown[]; decided: number; runId?: string } = { script: [], judge: [], decided: 0 };
  const requests: AutomationStudioLlmTaskRequest[] = [];
  /** The engine's own presses of "Find loans", with the title each ran with. */
  const engineFinds: unknown[] = [];
  /** The record output's label each engine press of "Find loans" ran with: which version of a Flow a replay ran. */
  const engineLabels: unknown[] = [];
  /** What an engine press of "Find loans" answers instead, or waits for: the site changed under a saved Flow. */
  const engine: { over?: ((parameters: Readonly<Record<string, unknown>>) => AutomationNodeExecutionResult | undefined | Promise<AutomationNodeExecutionResult | undefined>) | undefined } = {};
  let fluxNodes: FluxNodeService | undefined;
  const provider = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    requests.push(request);
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", summary: "Read.", decision: { kind: "complete", result: { instructed: [] } } }, usage: USAGE };
    if (request.taskKind === "loop_verification") {
      const reply = current.judge.shift();
      return (typeof reply === "function" ? (reply as (asked: AutomationStudioLlmTaskRequest) => unknown)(request) : reply) ?? judgedYes(request);
    }
    const next = current.script[current.decided] ?? toolCall(`look.${current.decided}`, LOOK_TOOL, {});
    // Past the script nothing would end the attempt but its purse, so the program stops it, as a person would.
    if (current.decided >= current.script.length && fluxNodes) void stopRunning(fluxNodes, current.runId);
    current.decided += 1;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted.", decision: typeof next === "function" ? next(request) : next }, usage: USAGE };
  });
  const byHand = fakeLibraryBinding(library, ({ value }) => (value.node === FIND_LOANS ? foundByHand(library, value) : undefined));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider }), llmEvidenceRuntime: byHand });
  service.bindNativeNodeRuntime(new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["library.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "library.find", packageVersion: "1.0.0", domainId: "library", nodes: [FIND_NODE] },
    { packageId: "library.find", packageVersion: "1.0.0", implementations: { [FIND_LOANS]: async ({ parameters }) => {
      engineFinds.push(parameters.title);
      engineLabels.push((parameters.recordOutput as JsonObject | undefined)?.label);
      const over = await engine.over?.(parameters);
      if (over) return over;
      const found: AutomationNodeExecutionResult = { status: "success", route: "success", outputs: { success: true }, effects: [{ type: "records.write", payload: { recordOutput: parameters.recordOutput ?? LOANS_OUTPUT, records: loansWith(library, parameters.title) } }] };
      return found;
    } } }
  ));
  automationStudioAnswerFirstAttemptPorts(service).sleep = async () => undefined;
  const made = () => createFluxNodeService({ service, domainId: "library", modelCaller: modelCaller(), startLocationOf: () => undefined, personWaitMs: options.personWaitMs ?? 60_000 });
  fluxNodes = made();
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  let nodes = fluxNodes;

  /** Starts a run with this script and these judge replies, answers what it asks with `answers`, and reads it to its end. */
  const run = async (body: unknown, given: { script?: readonly Decision[]; judge?: readonly unknown[]; answers?: (event: FluxNodeRunEvent) => FluxNodeEventAnswer | undefined; onStarted?: (state: FluxNodeRunStateBody) => void | Promise<void> } = {}) => {
    const parsed = parseFluxNodeRunRequest(body);
    if (!parsed.ok) throw new Error(`a bad request in the test: ${JSON.stringify(parsed.issues)}`);
    Object.assign(current, { script: given.script ?? [], judge: [...(given.judge ?? [])], decided: 0 });
    const firstRequest = requests.length;
    const started = await nodes.start(OWNER, parsed.value as FluxNodeRunRequest);
    if (!started.ok) throw new Error(`start refused: ${JSON.stringify(started.refusal)}`);
    current.runId = started.value.runId;
    const guard = setTimeout(() => void nodes.stop(OWNER, started.value.runId, {}), RUN_GUARD_MS);
    await given.onStarted?.(started.value);
    const events = await readToEnd(nodes, started.value.runId, given.answers);
    clearTimeout(guard);
    const state = await nodes.get(OWNER, started.value.runId);
    if (!state.ok || !state.value.result) throw new Error("the run has no result after its ended event");
    const asked = requests.slice(firstRequest);
    return {
      started: started.value, events, state: state.value, result: state.value.result as FluxNodeRunResult, asked,
      decisions: asked.filter((request) => request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority"),
      judgeCalls: asked.filter((request) => request.taskKind === "loop_verification")
    };
  };

  /**
   * Sets the script and judge replies for the runs that follow, for a caller that starts runs itself (the SDK over HTTP) and
   * not through `run`. What the model and the judge were asked since then is read from the returned handle.
   */
  const arm = (given: { script?: readonly Decision[]; judge?: readonly unknown[] } = {}) => {
    Object.assign(current, { script: given.script ?? [], judge: [...(given.judge ?? [])], decided: 0, runId: undefined });
    const from = requests.length;
    return {
      /** Every model request since arming, whatever its kind. */
      asked: () => requests.slice(from),
      decisions: () => requests.slice(from).filter((request) => request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority"),
      judgeCalls: () => requests.slice(from).filter((request) => request.taskKind === "loop_verification")
    };
  };

  /** A FluxNode service made again over the same Core, as a server restarted makes it: nothing held in memory, the registry read back from the Flows. */
  const restart = (): FluxNodeService => {
    nodes = made();
    fluxNodes = nodes;
    return nodes;
  };

  return { service, dataDir, get fluxNodes() { return nodes; }, library, requests, engineFinds, engineLabels, engine, run, arm, restart };
}

/** Stops the run `runId` names, or every run still going where none is named: the program stopping what has no more to try. */
async function stopRunning(nodes: FluxNodeService, runId: string | undefined): Promise<void> {
  if (runId !== undefined) {
    await nodes.stop(OWNER, runId, {});
    return;
  }
  const listed = await nodes.list(OWNER, { limit: 20 });
  if (!listed.ok) throw new Error(`list refused: ${JSON.stringify(listed.refusal)}`);
  for (const going of listed.value.runs.filter((each) => each.state === "running")) await nodes.stop(OWNER, going.runId, {});
}

/** Every event of a run up to `ended`, answering each that waits as `answers` says. */
async function readToEnd(nodes: FluxNodeService, runId: string, answers: ((event: FluxNodeRunEvent) => FluxNodeEventAnswer | undefined) | undefined): Promise<FluxNodeRunEvent[]> {
  const stream = await nodes.events(OWNER, runId, 0, new AbortController().signal);
  if (!stream.ok) throw new Error(`events refused: ${JSON.stringify(stream.refusal)}`);
  const events: FluxNodeRunEvent[] = [];
  for await (const event of stream.value) {
    events.push(event);
    const answer = answers?.(event);
    if (answer) {
      const taken = await nodes.answer(OWNER, runId, answer);
      if (!taken.ok) throw new Error(`answer refused: ${JSON.stringify(taken.refusal)}`);
    }
  }
  return events;
}

/** "Find loans" by hand: the rows its title finds, a step written and not run, or nothing for the fake to answer. */
function foundByHand(library: FakeLibrary, value: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  if (value.replay === "verify" || value.replay === "reset") return undefined;
  const parameters = (value.parameters ?? {}) as JsonObject;
  const ran = { node: FIND_LOANS, parameters, consequences: [] };
  const draft = { actionId: FIND_LOANS, input: value, ranWith: ran, replay: LOCATION, proposes: true, effect: "observe" as const };
  if (value.write === true) return { kind: "llm_evidence_tool_execution", evidence: { ok: true, written: true }, effectApplied: false, resultCode: "core.run_node.written", draft: { ...draft, written: true } };
  const rows = loansWith(library, parameters.title);
  return {
    kind: "llm_evidence_tool_execution", evidence: { read: { extracted: rows }, page: { heading: "Your account" } }, effectApplied: true, outputs: { records: rows }, draft,
    ...(value.replay === "step" ? { resultCode: "core.replay.replayed" } : {})
  };
}

/** A FluxNode that finds the loans with a title, typed both ways, with a check of its own. */
export function findLoansSpec(over: Partial<FluxNodeSpecInput> = {}): FluxNodeSpecInput {
  return {
    name: "library.find-loans", runtime: "library", goal: "List my loans whose title has {title} in it.", start: "library://account",
    inputs: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    outputs: { type: "object", properties: { loans: { type: "array", minItems: 1, items: { type: "object", properties: { title: { type: "string" }, due: { type: "string", format: "date" } }, required: ["title", "due"], additionalProperties: false } } }, required: ["loans"], additionalProperties: false },
    scope: { acts: [] }, hasCheck: true,
    ...over
  };
}
