// A lending library the engine can really run: the stubs in `./fake-library.ts` answer success
// and change nothing, so they cannot say what a run on the real engine did. Here a node's own
// implementation changes the library and counts each press, its read captures rows through a real
// record output, and `over` makes any node fail, wait or ask. `flowRunFixture` wires the Flow run
// stage (`../flow-run/`) to a real service, a real permission gate and a real dataset store, with no
// model anywhere. A lending library is none of the Lab's realistic scenarios.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions, type AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioServiceTrialCollaboratorRegistry, automationStudioServiceRegistryResolution } from "../../trial-ports/index.ts";
import { automationStudioAnswerFirstFlowRunEngineOf, type AutomationStudioAnswerFirstFlowRunEngine, type AutomationStudioAnswerFirstFlowRunPorts } from "../flow-run/index.ts";
import { automationStudioAnswerFirstRowSink, type AutomationStudioAnswerFirstRowSink } from "../rows/index.ts";
import { fakeLibrary, fakeLibraryBinding, READ_LOANS, RENEW_CARD, RENEW_LOAN, type FakeLibrary } from "./fake-library.ts";

export const OPEN_ACCOUNT = "domain.library.open_account";
/** The same read and press through the door a web step really uses: the node answers, and what it does goes out as an output. */
export const READ_BY_OUTPUT = "domain.library.read_loans_by_output";
export const RENEW_BY_OUTPUT = "domain.library.renew_loan_by_output";
/** A switch each press flips, which says what it flipped and takes the state to keep (`ensureState`), as a web press does: a toggle site's Save in small. */
export const HOLD_SHELF = "domain.library.hold_shelf";
/** A press with a `failed` way out, which the optional shape needs: a prompt's way out, say. */
export const CLOSE_PROMPT = "domain.library.close_prompt";
const READ_OUTPUT = "library.read";
const RENEW_OUTPUT = "library.renew";
const PACKAGE = { packageId: "library.package", packageVersion: "1.0.0" };

const node = (id: string, label: string, over: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition => ({
  schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label}.`, category: "action",
  source: { kind: "importer", domainId: "library", packageId: PACKAGE.packageId, implementationKey: id },
  availability: { kind: "domain", domainId: "library" }, requiredRuntimeCapabilities: ["library.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [], safety: { requiredPermissions: [] },
  ...over
});

const NODES: AutomationStudioNodeDefinition[] = [
  node(OPEN_ACCOUNT, "Open the account", { parameters: [{ id: "url", label: "Address", valueType: "string", required: false }] }),
  // `shape` is how a by-hand read writes its rows (`./fake-library.ts`); the engine's read takes it and writes its own.
  node(READ_LOANS, "Read loans", { outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }], parameters: [{ id: "recordOutput", label: "Record output", valueType: "object", required: false }, { id: "retry", label: "Retry", valueType: "object", required: false }, { id: "list", label: "The list", valueType: "object", required: false }, { id: "shape", label: "Shape", valueType: "string", required: false }] }),
  node(RENEW_LOAN, "Renew loan", { inputs: [{ id: "in", label: "In", valueType: "any", required: false }, { id: "item", label: "Item", valueType: "any", required: false }], parameters: [{ id: "control", label: "Control", valueType: "string", required: false }, { id: "title", label: "Title", valueType: "string", required: false }] }),
  node(RENEW_CARD, "Renew card", { parameters: [{ id: "control", label: "Control", valueType: "string", required: false }, { id: "expectedState", label: "Expected state", valueType: "object", required: false }] }),
  node(HOLD_SHELF, "Keep on the hold shelf", { outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "toggle", label: "What it flipped", valueType: "object" }, { id: "result", label: "Its answer", valueType: "object" }], parameters: [{ id: "control", label: "Control", valueType: "string", required: false }, { id: "ensureState", label: "State to keep", valueType: "object", required: false }] }),
  node(CLOSE_PROMPT, "Close the prompt", { outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }], parameters: [{ id: "control", label: "Control", valueType: "string", required: false }] }),
  node(READ_BY_OUTPUT, "Read loans", { outputAction: { fixedOutputId: READ_OUTPUT }, outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "records", label: "Records", valueType: "array" }], parameters: [{ id: "recordOutput", label: "Record output", valueType: "object", required: false }] }),
  node(RENEW_BY_OUTPUT, "Renew loan", { outputAction: { fixedOutputId: RENEW_OUTPUT }, inputs: [{ id: "in", label: "In", valueType: "any", required: false }, { id: "item", label: "Item", valueType: "any", required: false }], parameters: [{ id: "control", label: "Control", valueType: "string", required: false }] })
];

/** A node's answer in place of its own, for a test: a failure, a wait, a question. Nothing, and it does its own work. */
export type LibraryNodeOver = (request: { nodeId: string; press: number; signal?: AbortSignal | undefined; parameters?: Record<string, JsonValue> | undefined; inputs?: Record<string, JsonValue> | undefined }) => AutomationNodeExecutionResult | Promise<AutomationNodeExecutionResult> | undefined;

/** The library and everything the engine did to it. */
export type LibraryTarget = {
  library: FakeLibrary;
  /** Every press that really reached the target, with the row it carried. */
  presses: { node: string; subject: string; item?: JsonValue; title?: JsonValue }[];
  reads: number;
  /** Where the page is. A read fails anywhere but the account. */
  page: "elsewhere" | "account";
  /** The next rows a read finds beyond the library's: a list that grew. */
  over?: LibraryNodeOver;
};

export function libraryTarget(titles?: readonly string[]): LibraryTarget {
  return { library: fakeLibrary(titles), presses: [], reads: 0, page: "account" };
}

/** How the read shows a row to whoever reads it by hand: what the record output's allowlist then drops. */
export function shownRows(target: LibraryTarget): JsonObject[] {
  return target.library.loans.map((loan, index) => ({ title: loan.title, due: loan.due, shelfmark: `Shelf ${index + 1}`, $handle: `read-${target.reads}-row-${index}` }));
}

/** The node runtime whose implementations act on `target`. */
export function libraryTargetNodes(target: LibraryTarget): AutomationStudioNativeNodeRuntime {
  let calls = 0;
  const overOr = (nodeId: string, signal: AbortSignal | undefined, own: () => AutomationNodeExecutionResult, seen: { parameters?: Record<string, JsonValue>; inputs?: Record<string, JsonValue> } = {}) => async (): Promise<AutomationNodeExecutionResult> => {
    calls += 1;
    return await target.over?.({ nodeId, press: calls, signal, ...seen }) ?? own();
  };
  const success = (): AutomationNodeExecutionResult => ({ status: "success", route: "success", outputs: { success: true } });
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["library.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, ...PACKAGE, domainId: "library", nodes: NODES },
    { ...PACKAGE, implementations: {
      [OPEN_ACCOUNT]: ({ signal }) => overOr(OPEN_ACCOUNT, signal, () => {
        target.page = "account";
        return success();
      })(),
      [READ_LOANS]: ({ signal, parameters }) => overOr(READ_LOANS, signal, () => {
        if (target.page !== "account") return { status: "failed", route: "failed", message: "Page says: Nothing to see on Elm Street 4", failure: { category: "target_not_found", code: "library.list_not_on_page", retryable: false } };
        target.reads += 1;
        return { ...success(), effects: [{ type: "records.write", payload: { recordOutput: parameters.recordOutput as JsonValue, records: shownRows(target) } }] };
      })(),
      [RENEW_LOAN]: ({ signal, inputs, parameters }) => overOr(RENEW_LOAN, signal, () => pressLoan(target, inputs, parameters), { parameters, inputs })(),
      [RENEW_CARD]: ({ signal, parameters }) => overOr(RENEW_CARD, signal, () => pressCard(target), { parameters })(),
      [HOLD_SHELF]: ({ signal, parameters }) => overOr(HOLD_SHELF, signal, () => pressHold(target, parameters), { parameters })(),
      [CLOSE_PROMPT]: ({ signal, parameters }) => overOr(CLOSE_PROMPT, signal, () => {
        target.presses.push({ node: CLOSE_PROMPT, subject: "prompt" });
        return success();
      }, { parameters })(),
      [READ_BY_OUTPUT]: ({ parameters }) => ({ ...success(), effects: [{ type: "policy.output.dispatch", payload: { outputId: READ_OUTPUT, parameters: {}, recordOutput: parameters.recordOutput as JsonValue } }] }),
      [RENEW_BY_OUTPUT]: ({ inputs }) => ({ ...success(), effects: [{ type: "policy.output.dispatch", payload: { outputId: RENEW_OUTPUT, parameters: { title: String((inputs.item as JsonObject | undefined)?.title ?? "a loan") } } }] })
    } }
  );
}

/** A press on a loan really reaching the target: the row a For Each handed it, or the title it was written with. */
export function pressLoan(target: LibraryTarget, inputs: Record<string, JsonValue>, parameters: Record<string, JsonValue>): AutomationNodeExecutionResult {
  const item = inputs.item;
  const subject = String((item as JsonObject | undefined)?.title ?? parameters.title ?? "a loan");
  target.library.renewals[subject] = (target.library.renewals[subject] ?? 0) + 1;
  target.presses.push({ node: RENEW_LOAN, subject, ...(item === undefined ? {} : { item }), ...(parameters.title === undefined ? {} : { title: parameters.title }) });
  return { status: "success", route: "success", outputs: { success: true } };
}

/** The hold shelf's switch: already in the state asked, nothing is pressed; else it flips and says from what to what. */
function pressHold(target: LibraryTarget, parameters: Record<string, JsonValue>): AutomationNodeExecutionResult {
  const state = (on: boolean): JsonObject => ({ state: on ? "on" : "off" });
  const now = target.library.onHold === true;
  const asked = parameters.ensureState as JsonObject | undefined;
  if (asked?.state === state(now).state) return { status: "success", route: "success", outputs: { success: true, result: { skipped: "already_in_state" } } };
  target.library.onHold = !now;
  target.presses.push({ node: HOLD_SHELF, subject: "hold" });
  return { status: "success", route: "success", outputs: { success: true, toggle: { signature: state(!now), beforeSignature: state(now) } } };
}

/** A press on the card really reaching the target. */
export function pressCard(target: LibraryTarget): AutomationNodeExecutionResult {
  target.library.renewals.card = (target.library.renewals.card ?? 0) + 1;
  target.presses.push({ node: RENEW_CARD, subject: "card" });
  return { status: "success", route: "success", outputs: { success: true } };
}

/** Gives the engine a dispatcher for the output door's two outputs, as a real run's IO does. */
export function withOutputDoor(target: LibraryTarget): (engine: AutomationStudioAnswerFirstFlowRunEngine) => AutomationStudioAnswerFirstFlowRunEngine {
  return (engine) => ({
    ...engine,
    graphOptions: (input) => ({
      ...engine.graphOptions(input),
      effectDispatcher: async (effect) => {
        const payload = effect.payload as JsonObject;
        if (payload.outputId === READ_OUTPUT) {
          target.reads += 1;
          return { status: "success", route: "success", outputs: { result: { rows: shownRows(target) } } };
        }
        const title = String((payload.parameters as JsonObject).title);
        target.library.renewals[title] = (target.library.renewals[title] ?? 0) + 1;
        target.presses.push({ node: RENEW_BY_OUTPUT, subject: title });
        return { status: "success", route: "success", outputs: { result: { ok: true } } };
      }
    })
  });
}

/** The record output a saved read carries: it keeps title and due, and drops what the read minted and the shelfmark. */
export const LOANS_OUTPUT: JsonObject = {
  datasetId: "loans", label: "Loans", recordsPath: "records", writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "due", label: "Due", valueType: "string" }] }
};

/** One saved step, in the shape a draft holds one a run of the node left. */
export function savedStep(position: number, nodeId: string, parameters: JsonObject = {}, over: { consequences?: string[]; routing?: AutomationStudioFlowDraftStepRouting; disposition?: AutomationStudioFlowDraftStep["disposition"]; label?: string } = {}): AutomationStudioFlowDraftStep {
  const value: JsonObject = { node: nodeId, parameters, ...(over.consequences ? { consequences: over.consequences } : {}) };
  return {
    position, id: `saved.${position}`, iteration: position, callId: `call.${position}`, toolId: "core.run_node", actionId: nodeId,
    input: value, ranWith: value, effect: over.consequences?.length ? "mutate" : "observe", effectApplied: true, proposes: true, disposition: over.disposition ?? "kept",
    ...(over.routing ? { routing: over.routing } : {}), ...(over.label ? { words: { target: over.label } } : {})
  };
}

/** Read the loans, then renew each. */
export function renewEveryLoan(): AutomationStudioFlowDraftStep[] {
  return [
    savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list of loans" }),
    savedStep(2, RENEW_LOAN, { control: "Renew" }, { consequences: ["modify_existing"], routing: { kind: "repeat", through: "saved.2", over: "saved.1" }, label: "Renew" })
  ];
}

export type FlowRunFixture = {
  service: AutomationStudioService;
  target: LibraryTarget;
  ports: AutomationStudioAnswerFirstFlowRunPorts;
  sink: AutomationStudioAnswerFirstRowSink;
  record: AutomationStudioAttemptActRecord;
  permissions: AutomationStudioFlowBootstrapActionPermissions;
  stop: AbortController;
  counts: { liveSteps: number; arrived: boolean };
  /** What a person was asked, in order. */
  asked: string[];
  projectId: string;
  flowId: string;
};

export type FlowRunFixtureOptions = {
  target?: LibraryTarget;
  permittedConsequences?: AutomationStudioActionConsequence[];
  /** A person's answer to a permission question. Absent, nobody is there to ask. */
  answer?: "allow" | "decline" | "hang";
  /** Changes what the engine is given: a small step bound, a failing part. */
  engine?: (engine: AutomationStudioAnswerFirstFlowRunEngine) => AutomationStudioAnswerFirstFlowRunEngine;
  binding?: Partial<AutomationStudioLlmEvidenceRuntimeBinding>;
  over?: Partial<AutomationStudioServiceOptions>;
  startLocation?: string;
  record?: AutomationStudioAttemptActRecord;
  instruction?: string;
  /** The Flow's size bounds, where its setting raised them. */
  size?: AutomationStudioAnswerFirstFlowRunPorts["input"]["size"];
};

/** A real service on the fake target, and the Flow run stage's ports over it, with no model anywhere. */
export async function flowRunFixture(options: FlowRunFixtureOptions, cleanups: (() => Promise<void>)[]): Promise<FlowRunFixture> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-run-"));
  const target = options.target ?? libraryTarget();
  const native = libraryTargetNodes(target);
  const service = new AutomationStudioService({ dataDir, llmEvidenceRuntime: { ...fakeLibraryBinding(target.library), ...options.binding }, ...options.over });
  service.bindNativeNodeRuntime(native);
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const project = await service.createProject({ name: "Library", domainId: "library" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.loans", name: "Loans" });
  const now = Date.now();
  const instructionText = options.instruction ?? "Renew every loan on my library account.";
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.task", title: "The task", body: instructionText,
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });
  const collaborators = AutomationStudioServiceTrialCollaboratorRegistry.of(service)!;
  const runId = `explore.${project.id}`;
  await collaborators.startRuntimeSession({ projectId: project.id, flowId: flow.flowId, runId, metadata: {} });
  const datasets = collaborators.runDatasets();
  const sink = automationStudioAnswerFirstRowSink({
    runId, readRowsKey: "read.extracted", onRecordBatch: datasets.recordBatchHandler(project.id, runId),
    reader: { listDatasets: () => datasets.listRunDatasetsForVerification({ projectId: project.id, runId }), getPage: ({ datasetId, limit, cursor }) => datasets.getRunDatasetPage({ projectId: project.id, runId, datasetId, limit, ...(cursor === undefined ? {} : { cursor }) }) }
  });
  const stop = new AbortController();
  const asked: string[] = [];
  const port = options.answer ? askPort(options.answer, asked, stop.signal) : undefined;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: options.permittedConsequences ?? [], instructionIds: ["instruction.task"],
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false }),
    ...(port ? { ask: { port, timeoutMs: 60_000, signal: stop.signal } } : {})
  });
  const record = options.record ?? new AutomationStudioAttemptActRecord();
  const { registry, resolution } = automationStudioServiceRegistryResolution(native, flow.scope);
  const counts = { liveSteps: 0, arrived: false };
  const input: AutomationStudioAnswerFirstFlowRunPorts["input"] = {
    projectId: project.id, flowId: flow.flowId, registry, resolution, binding: { ...fakeLibraryBinding(target.library), ...options.binding },
    instructionText, instructionIds: ["instruction.task"], startLocation: options.startLocation,
    routing: { signaturesOf: () => undefined }, cancellation: { signal: () => stop.signal },
    ...(options.size ? { size: options.size } : {})
  };
  const engineOf = () => {
    const engine = automationStudioAnswerFirstFlowRunEngineOf({ ...input, owner: service });
    return options.engine ? options.engine(engine) : engine;
  };
  const ports: AutomationStudioAnswerFirstFlowRunPorts = {
    input, runId, record, sink, permissions, engine: engineOf,
    stepped: () => { counts.liveSteps += 1; },
    arrived: () => { counts.arrived = true; }
  };
  return { service, target, ports, sink, record, permissions, stop, counts, asked, projectId: project.id, flowId: flow.flowId };
}

/** A person, answering a permission question the same way each time, or never. */
function askPort(answer: "allow" | "decline" | "hang", asked: string[], stop: AbortSignal): AutomationStudioParkingPort {
  return {
    open: (ask) => { asked.push(ask.permissionRequest?.sentence ?? ask.text); },
    awaitAnswer: async (ask, wait) => {
      if (answer !== "hang") return { askId: ask.askId, answeredAt: Date.now(), kind: answer === "allow" ? "grant" : "deny", value: null, actorId: "person" };
      await new Promise<void>((resolve) => {
        if (stop.aborted || wait.signal?.aborted) resolve();
        stop.addEventListener("abort", () => resolve(), { once: true });
      });
      return undefined;
    }
  };
}
