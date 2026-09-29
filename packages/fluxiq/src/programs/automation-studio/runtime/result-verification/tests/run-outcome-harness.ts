// The run-outcome tests' shared harness: a run, a Flow, a scripted provider,
// and a store that keeps what each pass saved. Split out of `run-outcome.test.ts`
// when the repair loop's tests moved to `run-outcome-repair.test.ts`.
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import type { AutomationStudioFlowGraphJudgement } from "../../flow-version/index.ts";
import { verifyAutomationStudioRuntimeSessionResult, type AutomationStudioResultVerificationPorts } from "../run-outcome.ts";

export const ANSWER = { yes: "yes", no: "no", unknown: "unknown" } as const;
export const schema: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "role", label: "Role", valueType: "string" }]
};

export const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow-1",
  ownerKind: "task",
  ownerId: "task-1",
  name: "Members",
  nodes: [
    { id: "n1", definitionId: "builtin.navigate" },
    { id: "n2", definitionId: "builtin.policy.action" },
    { id: "n3", definitionId: "builtin.end" }
  ],
  edges: [],
  createdAt: 1,
  updatedAt: 1
};

export const session = (fields: Partial<AutomationStudioRuntimeSession> = {}): AutomationStudioRuntimeSession => ({
  schemaVersion: "0.1",
  runId: "run-1",
  projectId: "project-1",
  targetKind: "flow",
  targetId: "flow-1",
  flowId: "flow-1",
  status: "succeeded",
  queuedAt: 1,
  startedAt: 2,
  finishedAt: 3,
  flow,
  ...fields
});

export const runDetail = (): AutomationStudioFlowRunDetail => ({
  schemaVersion: "0.1",
  summary: {
    schemaVersion: "0.1", runId: "run-1", flowId: "flow-1", projectId: "project-1", status: "succeeded",
    updatedAt: 3, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 3, interventionCount: 0, adaptationCount: 0
  },
  routeDecisions: [],
  subflows: [],
  interventions: [],
  adaptationIds: [],
  changeProposalIds: []
});

/** The request, as a Flow instruction states it: what the empty-result judgement is made against. */
export const instruction = (body: string): AutomationStudioFlowInstruction => ({
  schemaVersion: "0.1",
  instructionId: "instruction.flow.goal",
  title: "Goal",
  body,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" },
  priority: 1,
  status: "active",
  requirement: "required",
  createdAt: 1,
  updatedAt: 1
});

export const datasetSummary = (fields: Partial<AutomationStudioRunDatasetSummary> = {}): AutomationStudioRunDatasetSummary => ({
  runId: "run-1", datasetId: "members", nodeIds: ["n2"], schemaDigest: "digest",
  recordCount: 240, truncated: false, invalidCount: 0, updatedAt: 3, ...fields
});

/** What a scripted call does in place of answering: fail as a provider would. */
export const UNAVAILABLE = Symbol("unavailable");
export type ScriptedAnswer = string | undefined | typeof UNAVAILABLE;

/**
 * A provider that answers the one field a verification asks for: `answer` on
 * every call, or `answers` in order when a test scripts each call.
 */
export function provider(
  answer: string | undefined,
  seen: AutomationStudioLlmTaskRequest[],
  answers?: readonly ScriptedAnswer[],
  /** The rest of what the judgement said, where a test is about the reading rather than the verdict. */
  said?: Record<string, string>
): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      const scripted = answers ? answers[seen.length] : answer;
      seen.push(request);
      if (scripted === UNAVAILABLE) throw new Error("provider down");
      const answer_ = scripted;
      return {
        response: { kind: "diagnosis", summary: "Judged.", ...(answer_ ? { diagnosis: { answersRequest: answer_, ...(said ?? {}) } } : {}) },
        usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 }
      };
    }
  };
}

export type Harness = {
  ports: AutomationStudioResultVerificationPorts;
  written: AutomationStudioRuntimeSession[];
  saved: AutomationStudioFlowRunDetail[];
  requests: AutomationStudioLlmTaskRequest[];
  /** Provider resolutions attempted. A result Core settles itself must cost none. */
  resolutions: { count: number };
  /** The verdicts written against the versions they judged. */
  judgements: AutomationStudioFlowGraphJudgement[];
};

export function harness(options: {
  answer?: string | undefined;
  answers?: readonly ScriptedAnswer[];
  datasets?: AutomationStudioRunDatasetSummary[];
  rows?: JsonObject[];
  schema?: AutomationStudioRecordSchema;
  withProvider?: boolean;
  datasetsUnavailable?: boolean;
  listThrows?: boolean;
  pageLimits?: unknown[];
  /** The request, as the Flow's own instructions state it. */
  instructions?: readonly AutomationStudioFlowInstruction[];
  /** A provider resolution that never settles: the 2026-09-20 hang, in one line. */
  resolverHangs?: boolean;
  /** A deployment with no project database: the version set still reaches the run detail, the history does not. */
  noJudgementStore?: boolean;
  /** What the judgement said beyond its verdict, for the tests about the reading it hands on. */
  said?: Record<string, string>;
} = {}): Harness {
  const written: AutomationStudioRuntimeSession[] = [];
  const saved: AutomationStudioFlowRunDetail[] = [];
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const resolutions = { count: 0 };
  const judgements: AutomationStudioFlowGraphJudgement[] = [];
  const datasets = options.datasets ?? [datasetSummary()];
  const page: AutomationStudioRunDatasetPage = { summary: datasets[0] ?? datasetSummary(), schema: options.schema ?? schema, rows: options.rows ?? [{ name: "Hollis Abbott", role: "member" }], nextCursor: null };
  const ports: AutomationStudioResultVerificationPorts = {
    flowInstructionSet: async () => [...(options.instructions ?? [])],
    getFlowRunDetail: async () => runDetail(),
    saveFlowRunDetail: async (detail) => { saved.push(detail); return detail; },
    writeRuntimeSession: async (_projectId, next) => { written.push(next); },
    deniedEvidenceKeys: [],
    ...(options.noJudgementStore ? {} : { recordFlowGraphJudgements: async ({ judgement }) => { judgements.push(judgement); } }),
    ...(options.datasetsUnavailable ? {} : {
      listRunDatasets: async () => {
        if (options.listThrows) throw new Error("SQLITE_CANTOPEN");
        return datasets;
      },
      getRunDatasetPage: async (request) => {
        options.pageLimits?.push(request.limit);
        return { ...page, rows: page.rows.slice(0, typeof request.limit === "number" ? request.limit : page.rows.length) };
      }
    }),
    ...(options.withProvider === false ? {} : {
      resolveProvider: options.resolverHangs
        ? () => { resolutions.count += 1; return new Promise<never>(() => undefined); }
        : async () => { resolutions.count += 1; return { provider: provider(options.answer, requests, options.answers, options.said) }; }
    })
  };
  return { ports, written, saved, requests, resolutions, judgements };
}

export const verify = async (context: Harness, overrides: Partial<Parameters<typeof verifyAutomationStudioRuntimeSessionResult>[0]> = {}) =>
  await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow, ...overrides });
