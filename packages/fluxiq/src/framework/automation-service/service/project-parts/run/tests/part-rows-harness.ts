// A list page and the real runner over it: the real store, executor, For Each and frames, with
// a host and a domain made of plain functions. A row is one a person could tell by its `key`;
// its control looks the same on every row, so a question about the control says which row.
// What is asserted is what reached the domain.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowSubflow, type AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFactCondition, AutomationStudioTargetReacquireRequest } from "../../../../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioHostResourcePort, AutomationStudioHostRuntimeBoundary } from "../../../../../../runtime/automation-host/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../../../../../runtime/native-nodes/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../../persistence/automation/index.ts";
import { AutomationStudioProjectParts, saveProjectPartsOfAppliedFlow, type AutomationStudioProjectPartRunPorts, type AutomationStudioProjectPartsPorts } from "../../index.ts";

type Collaborators = NonNullable<ReturnType<AutomationStudioProjectPartRunPorts["collaborators"]>>;

const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in"): AutomationStudioFlowEdge => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

export const PROJECT = "project.rows";
export const SITE = "https://list.example";
const SEARCH = { selector: "#search" };
const PRESS = { selector: "#press" };
const FOR_EACH = "builtin.control.for-each";
const OUTPUT_NODE = "custom.press";

export type Row = { key: string; words: string; count?: number };

/** The part of a press: it takes a row and presses that row's control, and reads no list of its own. */
export function actionGraph(key: string, options: { pressDefinition?: string } = {}): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  const nodes: AutomationStudioFlowNode[] = [
    { id: `${key}.start`, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
    { id: `${key}.press`, definitionId: options.pressDefinition ?? OUTPUT_NODE, definitionVersion: "1.0.0", label: "Press it", parameterValues: { target: PRESS }, metadata: { declaredConsequences: ["create_new"] } }
  ];
  return { ...blank, interface: { inputs: [{ id: "item", name: "The row", valueType: { kind: "unknown" }, required: true }], outputs: [] }, nodes, edges: [edge(`${key}.1`, `${key}.start`, "success", `${key}.press`)] };
}

/** Read a list, then for each row call a part, handing it the row: `call` says how the step names what it calls and `given` what it hands it. */
export function siteGraph(key: string, call: JsonObject, options: { given?: JsonObject; readMetadata?: JsonObject } = {}): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  const at = (name: string) => `${key}.${name}`;
  const nodes: AutomationStudioFlowNode[] = [
    { id: at("start"), definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
    { id: at("read"), definitionId: "custom.read", definitionVersion: "1.0.0", label: "Read the list", parameterValues: { target: SEARCH }, metadata: options.readMetadata ?? { declaredConsequences: [], effect: "observe" } },
    { id: at("each"), definitionId: FOR_EACH, definitionVersion: "1.0.0", label: "Each row" },
    { id: at("call"), definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Do it to this row", parameterValues: { ...call, inputs: options.given ?? { item: { $state: { path: "item" } } } }, metadata: {} },
    { id: at("end"), definitionId: "builtin.control.end", definitionVersion: "1.0.0", label: "End" }
  ];
  const edges = [
    edge(`${key}.1`, at("start"), "success", at("read")),
    edge(`${key}.2`, at("read"), "success", at("each")),
    edge(`${key}.3`, at("read"), "rows", at("each"), "items"),
    edge(`${key}.4`, at("each"), "body", at("call")),
    edge(`${key}.5`, at("call"), "success", at("each")),
    edge(`${key}.6`, at("each"), "done", at("end"))
  ];
  return { ...blank, interface: { inputs: [], outputs: [] }, nodes, edges };
}

/** A part that hands on the row it was handed, to the part it calls. */
export function passOnGraph(key: string, call: JsonObject): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  const nodes: AutomationStudioFlowNode[] = [
    { id: `${key}.start`, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
    { id: `${key}.call`, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Hand it on", parameterValues: { ...call, inputs: { item: { $state: { path: "item" } } } }, metadata: {} }
  ];
  return { ...blank, interface: { inputs: [{ id: "item", name: "The row", valueType: { kind: "unknown" }, required: true }], outputs: [] }, nodes, edges: [edge(`${key}.1`, `${key}.start`, "success", `${key}.call`)] };
}

/** The page as it stands. Tests change it between reads and presses. */
export type RowsPage = {
  rows: Row[];
  /** Rows whose control is not on the page. */
  noControl: Set<string>;
  /** Rows whose control the page cannot single out. */
  cannotTell: Set<string>;
  afterRead?: (reads: number) => void | Promise<void>;
  afterPress?: (key: string) => void;
  readFails?: (reads: number) => boolean;
  pressAnswer?: (key: string, tries: number) => "landed" | "unacted" | "uncertain";
};

export type RowsDomain = {
  /** Each press that reached the page, by the row it was handed. */
  pressed: string[];
  /** Each row whose press the domain was asked to describe. */
  described: string[];
  /** How many times the list was read. */
  reads: { count: number };
  /** What the page was asked about a control, by the row in the question, or `none`. */
  asked: string[];
  /** The rows a press was handed, whole. */
  handed: JsonValue[];
  /** Anything else that ran. */
  ran: string[];
};

/** Read the list, then press something on each row it read. `before` runs before the press on each pass. */
export function rowGraph(key: string, options: { readMetadata?: JsonObject; pressDefinition?: string; before?: AutomationStudioFlowNode } = {}): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  const at = (name: string) => `${key}.${name}`;
  const nodes: AutomationStudioFlowNode[] = [
    { id: at("start"), definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
    { id: at("read"), definitionId: "custom.read", definitionVersion: "1.0.0", label: "Read the list", parameterValues: { target: SEARCH }, metadata: options.readMetadata ?? { declaredConsequences: [], effect: "observe" } },
    { id: at("each"), definitionId: FOR_EACH, definitionVersion: "1.0.0", label: "Each row" },
    ...(options.before ? [options.before] : []),
    { id: at("press"), definitionId: options.pressDefinition ?? OUTPUT_NODE, definitionVersion: "1.0.0", label: "Press it", parameterValues: { target: PRESS }, metadata: { declaredConsequences: ["create_new"] } },
    { id: at("end"), definitionId: "builtin.control.end", definitionVersion: "1.0.0", label: "End" }
  ];
  const firstOfBody = options.before?.id ?? at("press");
  const edges = [
    edge(`${key}.1`, at("start"), "success", at("read")),
    edge(`${key}.2`, at("read"), "success", at("each")),
    edge(`${key}.3`, at("read"), "rows", at("each"), "items"),
    edge(`${key}.4`, at("each"), "body", firstOfBody),
    edge(`${key}.5`, at("each"), "item", at("press"), "item"),
    edge(`${key}.6`, at("press"), "success", at("each")),
    edge(`${key}.7`, at("each"), "done", at("end")),
    ...(options.before ? [edge(`${key}.8`, options.before.id, "success", at("press"))] : [])
  ];
  return { ...blank, interface: { inputs: [], outputs: [] }, nodes, edges };
}

/** A part whose only step calls another part, by its Subflow. */
export function callerGraph(key: string, subflowId: string): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${key}`, projectId: PROJECT, name: key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${key}`, subflowGraph: true } });
  const nodes: AutomationStudioFlowNode[] = [
    { id: `${key}.start`, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
    { id: `${key}.first`, definitionId: "custom.first", definitionVersion: "1.0.0", label: "Look at the page", parameterValues: { target: SEARCH }, metadata: { declaredConsequences: [] } },
    { id: `${key}.call`, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Call", parameterValues: { subflowId, inputs: {}, outputs: {} }, metadata: {} }
  ];
  return { ...blank, interface: { inputs: [], outputs: [] }, nodes, edges: [edge(`${key}.1`, `${key}.start`, "success", `${key}.first`), edge(`${key}.2`, `${key}.first`, "success", `${key}.call`)] };
}

function subflowOf(key: string, flowId = "flow.source"): AutomationStudioFlowSubflow {
  return { schemaVersion: "0.1", subflowId: `subflow.${key}`, flowId, projectId: PROJECT, name: `Part ${key}`, description: `Part ${key}`, role: "utility", graphFlowId: `graph.${key}`, createdAt: 1, updatedAt: 1, status: "active" } as unknown as AutomationStudioFlowSubflow;
}

function hostOf(page: RowsPage, domain: RowsDomain, extra: Partial<AutomationStudioHostRuntimeBoundary>, noMatcher: boolean): AutomationStudioHostRuntimeBoundary {
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: ["fact-evaluation"],
    factEvaluator: (conditions: readonly AutomationStudioFactCondition[]) => conditions.map((condition) => {
      if (condition.fact === "url") return { result: new RegExp(String(condition.value), "u").test(`${SITE}/page`) ? "true" as const : "false" as const, capturedAt: 1 };
      const target = condition.target as { selector?: unknown; row?: unknown };
      if (target.selector === SEARCH.selector) return { result: "true" as const, capturedAt: 1 };
      // The same control on every row: asked with no row, the page cannot say which.
      if (typeof target.row !== "string") {
        domain.asked.push("none");
        return { result: page.rows.length > 1 ? "unknown" as const : "true" as const, capturedAt: 1 };
      }
      domain.asked.push(target.row);
      if (page.cannotTell.has(target.row)) return { result: "unknown" as const, capturedAt: 1 };
      return { result: page.rows.some((row) => row.key === target.row) && !page.noControl.has(target.row) ? "true" as const : "false" as const, capturedAt: 1 };
    }),
    reacquireTarget: ({ stale, candidates }: AutomationStudioTargetReacquireRequest) => {
      const matches = candidates.filter((candidate) => keyOf(candidate) === keyOf(stale));
      if (matches.length === 1) return { outcome: "found", value: matches[0]! };
      return matches.length === 0 ? { outcome: "gone" } : { outcome: "unmatched", reason: "ambiguous" };
    },
    ...extra
  };
  if (noMatcher) delete host.reacquireTarget;
  return host;
}

const keyOf = (value: JsonValue | undefined): string | undefined => {
  const { key } = (value ?? {}) as { key?: unknown };
  return typeof key === "string" ? key : undefined;
};

function nativeOf(page: RowsPage, domain: RowsDomain, moves: ReadonlySet<string>) {
  const tries = new Map<string, number>();
  return {
    getRuntimeCapabilities: () => [],
    getDefinition: (id: string) => id === OUTPUT_NODE ? { source: { kind: "importer" }, outputAction: { fixedOutputId: "press" } } : undefined,
    resolveActionEffect: (node: AutomationStudioFlowNode) => moves.has(node.id) ? { effectClass: "state", permissionConsequences: [] } : undefined,
    resolveTargetRefresh: () => ({ kind: "none" }),
    getTargetHooks: () => ({ controlParameterKeys: new Set(["target"]) }),
    execute: async (node: AutomationStudioFlowNode, inputs: Record<string, JsonValue>, _signal: unknown, hostContext: unknown) => {
      const said = (outputs: JsonObject = {}) => ({ result: { status: "success", route: "success", outputs } });
      if (node.id.endsWith(".read")) {
        domain.reads.count += 1;
        const count = domain.reads.count;
        if (page.readFails?.(count)) return { result: { status: "failed", route: "failed", outputs: {}, message: "PAGEWORD", failure: { category: "action_failed", code: "domain.read_failed", retryable: false, stage: "execution", effect: "unacted" } } };
        const rows = page.rows.map((row) => ({ ...row }));
        await page.afterRead?.(count);
        return said({ rows });
      }
      const row = keyOf(inputs.item);
      // Nothing that asks only what a press would send is a press: a real attempt always says where it stands.
      if (node.definitionId === OUTPUT_NODE && !hostContext) {
        domain.described.push(row ?? "none");
        return { result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "press", parameters: { target: { ...PRESS, ...(row ? { row } : {}) } } } }] } };
      }
      if (node.id.endsWith(".press")) {
        const key = row ?? "none";
        const tried = (tries.get(key) ?? 0) + 1;
        tries.set(key, tried);
        domain.pressed.push(key);
        domain.handed.push(inputs.item ?? null);
        const answer = page.pressAnswer?.(key, tried) ?? "landed";
        if (answer !== "landed") return { result: { status: "failed", route: "failed", outputs: {}, message: "PAGEWORD", failure: { category: answer === "uncertain" ? "ambiguous_or_unknown" : "action_failed", code: "domain.press_failed", retryable: true, stage: "execution", effect: answer === "uncertain" ? "ambiguous" : "unacted" } } };
        page.afterPress?.(key);
        return said();
      }
      domain.ran.push(node.id);
      return said();
    }
  };
}

export type RowsHarness = {
  page: RowsPage;
  domain: RowsDomain;
  parts: AutomationStudioProjectParts;
  sessions: AutomationStudioRuntimeSession[];
  /** What the project's other runs are, as the service would list them. */
  otherRuns: { list: () => Promise<AutomationStudioRuntimeSession[]> };
  pool: AutomationStudioProjectDatabasePool;
  /** The executor's parts, as a run of a Flow is made from them. */
  executor(): ReturnType<Collaborators["executor"]>;
  save(graphs: AutomationStudioFlowArtifact[], flowId?: string): Promise<string>;
  close(): Promise<void>;
};

export async function openRowsHarness(options: { rows?: Row[]; hostResources?: AutomationStudioHostResourcePort; moves?: readonly string[]; host?: Partial<AutomationStudioHostRuntimeBoundary>; noMatcher?: boolean } = {}): Promise<RowsHarness> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-part-rows-test-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const page: RowsPage = { rows: options.rows ?? [{ key: "a", words: "first" }, { key: "b", words: "second" }, { key: "c", words: "third" }], noControl: new Set(), cannotTell: new Set() };
  const domain: RowsDomain = { pressed: [], described: [], reads: { count: 0 }, asked: [], handed: [], ran: [] };
  const sessions: AutomationStudioRuntimeSession[] = [];
  const otherRuns: RowsHarness["otherRuns"] = { list: async () => [] };
  const moves = new Set(options.moves ?? []);
  const run: AutomationStudioProjectPartRunPorts = {
    collaborators: () => ({
      catalogue: () => ({ listPublishedFlowSnapshots: async () => [], listFlowPublicationRecords: async () => [] }),
      writeRuntimeSession: async (_projectId: string, session: AutomationStudioRuntimeSession) => {
        sessions.push(structuredClone(session));
      },
      executor: () => ({ hostRuntime: hostOf(page, domain, { ...(options.hostResources ? { hostResources: options.hostResources } : {}), ...options.host }, options.noMatcher === true), nativeNodeRuntime: nativeOf(page, domain, moves) as unknown as AutomationStudioNativeNodeRuntime }),
      runDatasets: () => ({ available: false }) as unknown as ReturnType<Collaborators["runDatasets"]>,
      conversations: () => ({ available: false }) as unknown as ReturnType<Collaborators["conversations"]>
    }),
    openRun: () => ({ gate: { checkpoint: () => null }, close: () => undefined }),
    getRuntimeSession: async () => null,
    driving: { admissions: new Set(), listRuntimeSessions: async () => await otherRuns.list() }
  };
  const parts = new AutomationStudioProjectParts({ pool, ports: {} as unknown as AutomationStudioProjectPartsPorts, run });
  return {
    page, domain, parts, sessions, otherRuns, pool,
    executor: () => run.collaborators()!.executor(),
    save: async (graphs, flowId = "flow.source") => {
      const saved = await saveProjectPartsOfAppliedFlow({ pool, projectId: PROJECT, flowId, requestWords: "do what a person asked", startLocation: `${SITE}/start`, subflows: graphs.map((graph) => ({ subflow: subflowOf(graph.name, flowId), graphFlow: graph })) });
      if (saved.skipped.length) throw new Error(`skipped: ${JSON.stringify(saved.skipped)}`);
      return saved.saved.at(-1)!.partId;
    },
    close: async () => {
      await pool.closeAll();
      await rm(rootDir, { recursive: true, force: true });
    }
  };
}

export const SESSION_AT = (status: AutomationStudioRuntimeSession["status"], metadata: JsonObject = {}): AutomationStudioRuntimeSession => ({ schemaVersion: "0.1", runId: `run.${status}`, projectId: PROJECT, targetKind: "flow", targetId: "flow.other", flowId: "flow.other", status, queuedAt: 1, metadata }) as AutomationStudioRuntimeSession;
