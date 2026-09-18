import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { verifyAutomationStudioRuntimeSessionResult, type AutomationStudioResultVerificationPorts } from "../run-outcome.ts";

// The whole path, driven end to end: a run that finished without a failed step,
// its stored records read, one question asked, and the run's own record written
// back.
//
// The defect this proves against is the one measured live on 2026-09-17: a
// request for "members matching hollis who are admins" produced a Flow of
// navigate, extract, end -- no step that narrows anything -- and returned all
// 240 members. Every step succeeded, the run reported `passed`, and the only
// reason anyone noticed is that the test facility held a written answer key.

const ANSWER = { yes: "yes", no: "no", unknown: "unknown" } as const;

const schema: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "role", label: "Role", valueType: "string" }]
};

const flow: AutomationStudioFlowDocument = {
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

const session = (fields: Partial<AutomationStudioRuntimeSession> = {}): AutomationStudioRuntimeSession => ({
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

const runDetail = (): AutomationStudioFlowRunDetail => ({
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

const datasetSummary = (fields: Partial<AutomationStudioRunDatasetSummary> = {}): AutomationStudioRunDatasetSummary => ({
  runId: "run-1", datasetId: "members", nodeIds: ["n2"], schemaDigest: "digest",
  recordCount: 240, truncated: false, invalidCount: 0, updatedAt: 3, ...fields
});

/** A provider that answers the one field a verification asks for. */
function provider(answer: string | undefined, seen: AutomationStudioLlmTaskRequest[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      seen.push(request);
      return {
        response: { kind: "diagnosis", summary: "Judged.", ...(answer ? { diagnosis: { answersRequest: answer } } : {}) },
        usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 }
      };
    }
  };
}

type Harness = {
  ports: AutomationStudioResultVerificationPorts;
  written: AutomationStudioRuntimeSession[];
  saved: AutomationStudioFlowRunDetail[];
  requests: AutomationStudioLlmTaskRequest[];
};

function harness(options: {
  answer?: string | undefined;
  datasets?: AutomationStudioRunDatasetSummary[];
  rows?: JsonObject[];
  schema?: AutomationStudioRecordSchema;
  withProvider?: boolean;
  datasetsUnavailable?: boolean;
  listThrows?: boolean;
  pageLimits?: unknown[];
} = {}): Harness {
  const written: AutomationStudioRuntimeSession[] = [];
  const saved: AutomationStudioFlowRunDetail[] = [];
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const datasets = options.datasets ?? [datasetSummary()];
  const page: AutomationStudioRunDatasetPage = { summary: datasets[0] ?? datasetSummary(), schema: options.schema ?? schema, rows: options.rows ?? [{ name: "Hollis Abbott", role: "member" }], nextCursor: null };
  const ports: AutomationStudioResultVerificationPorts = {
    flowInstructionSet: async () => [],
    getFlowRunDetail: async () => runDetail(),
    saveFlowRunDetail: async (detail) => { saved.push(detail); return detail; },
    writeRuntimeSession: async (_projectId, next) => { written.push(next); },
    deniedEvidenceKeys: [],
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
    ...(options.withProvider === false ? {} : { resolveProvider: async () => ({ provider: provider(options.answer, requests) }) })
  };
  return { ports, written, saved, requests };
}

const verify = async (context: Harness, overrides: Partial<Parameters<typeof verifyAutomationStudioRuntimeSessionResult>[0]> = {}) =>
  await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: session(), flow, ...overrides });

describe("verifyAutomationStudioRuntimeSessionResult", () => {
  it("fails a succeeded run whose result the model says does not answer the request", async () => {
    const context = harness({ answer: ANSWER.no });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.verdict).toBe("does_not_answer");
    expect(String(recorded.reason)).toContain("not to answer the request");
    expect(String(recorded.observation)).toContain("240 records stored");
    expect(context.written.at(-1)?.status).toBe("failed");
    expect(context.saved.at(-1)?.summary.status).toBe("failed");
  });

  it("fails closed when the model is unsure", async () => {
    // Mutation: treat `unsure` as answering. The session then comes back
    // `succeeded` and both assertions fail.
    const next = await verify(harness({ answer: ANSWER.unknown }));
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).verdict).toBe("unsure");
  });

  it("fails closed when the reply never says", async () => {
    const next = await verify(harness({ answer: undefined }));
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.verdict_absent");
  });

  it("leaves a run that answers alone, and still records that it was judged", async () => {
    const context = harness({ answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).verdict).toBe("answers");
    expect(context.requests).toHaveLength(1);
  });

  it("asks once, as a loop_verification carrying the result summary and the Flow's shape", async () => {
    const context = harness({ answer: ANSWER.yes });
    await verify(context);
    const request = context.requests[0];
    expect(context.requests).toHaveLength(1);
    expect(request?.taskKind).toBe("loop_verification");
    expect(request?.expectedOutput).toBe("diagnosis");
    expect(request?.context.resultSummary?.totalRecordCount).toBe(240);
    expect(request?.context.resultSummary?.flowShape.map((step) => step.definitionId)).toEqual(["builtin.navigate", "builtin.policy.action", "builtin.end"]);
    expect(request?.context.stage).toBeUndefined();
  });

  it("fails a run that stored nothing without spending a call", async () => {
    // Mutation: report success when the record count is zero. The session comes
    // back `succeeded` and this fails.
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ recordCount: 0 })] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.no_records");
    expect(context.requests).toHaveLength(0);
  });

  it("fails a run whose every row was refused, without spending a call", async () => {
    // Mutation: ignore validation refusals when every row was refused. The code
    // becomes `no_records` and this fails.
    const context = harness({ answer: ANSWER.yes, datasets: [datasetSummary({ recordCount: 0, invalidCount: 5 })] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.every_record_refused");
    expect(context.requests).toHaveLength(0);
  });

  it("records that nothing was judged, rather than a pass, when no model can be asked", async () => {
    const context = harness({ withProvider: false });
    const next = await verify(context);
    expect(next.status).toBe("succeeded");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.performed).toBe(false);
    expect(recorded.verdict).toBeUndefined();
    expect(recorded.code).toBe("core.result.no_model_available");
  });

  it("records that there was nothing to judge when the run stored no record set", async () => {
    const next = await verify(harness({ datasetsUnavailable: true }));
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).code).toBe("core.result.nothing_to_judge");
  });

  it("fails closed, naming the error's kind and not its message, when the result cannot be read", async () => {
    const context = harness({ listThrows: true, answer: ANSWER.yes });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.code).toBe("core.result.unreadable");
    expect(String(recorded.observation)).not.toContain("SQLITE_CANTOPEN");
    expect(context.requests).toHaveLength(0);
  });

  it("fails a run whose stored rows leave a required field empty, without spending a call", async () => {
    // Measured live on 2026-09-18: rows came back with required fields empty
    // and the run reported `passed`. Mutation: let a row missing a required
    // value through the free check -- the model is then asked, answers `yes`,
    // and the session comes back `succeeded`.
    const homes: AutomationStudioRecordSchema = {
      schemaVersion: "0.1",
      fields: [{ id: "address", label: "Address", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "string", required: true }]
    };
    const rows = Array.from({ length: 10 }, (_row, index) => ({ address: `${index} Kelford Row`, price: index === 0 ? "£410,000" : "" }));
    const context = harness({ answer: ANSWER.yes, schema: homes, rows, datasets: [datasetSummary({ datasetId: "homes", recordCount: 10 })] });
    const next = await verify(context);
    expect(next.status).toBe("failed");
    const recorded = next.metadata?.resultVerification as JsonObject;
    expect(recorded.code).toBe("core.result.required_values_missing");
    expect(recorded.basis).toBe("core_observation");
    expect(recorded.status).toBe("refuted");
    expect(String(recorded.observation)).toBe("9 of 10 rows checked, of 10 stored, have no value for a required field (price).");
    expect(context.requests).toHaveLength(0);
    expect(context.saved.at(-1)?.metadata?.resultVerificationFailure).toEqual({ category: "output_not_observed", code: "core.result.required_values_missing" });
  });

  it("reads a full page of rows to check, and still shows the model only a few", async () => {
    const pageLimits: unknown[] = [];
    const rows = Array.from({ length: 30 }, (_row, index) => ({ name: `Hollis ${index}`, role: "admin" }));
    const context = harness({ answer: ANSWER.yes, rows, pageLimits });
    await verify(context);
    expect(pageLimits).toEqual([200]);
    const sent = context.requests[0]?.context.resultSummary?.recordSets[0];
    expect(sent?.rowsChecked).toBe(30);
    expect(sent?.sampleRows?.length).toBeLessThanOrEqual(4);
  });

  it("records a result nobody judged as unverified, never as confirmed", async () => {
    // Mutation: read a skipped verification as a pass. `status` then says
    // `confirmed` for a result no model saw, and this fails.
    const next = await verify(harness({ withProvider: false }));
    expect(next.status).toBe("succeeded");
    expect((next.metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("records a judged result as confirmed or refuted, and a run with nothing to judge as having no result", async () => {
    expect(((await verify(harness({ answer: ANSWER.yes }))).metadata?.resultVerification as JsonObject).status).toBe("confirmed");
    expect(((await verify(harness({ answer: ANSWER.no }))).metadata?.resultVerification as JsonObject).status).toBe("refuted");
    expect(((await verify(harness({ answer: ANSWER.unknown }))).metadata?.resultVerification as JsonObject).status).toBe("refuted");
    expect(((await verify(harness({ datasetsUnavailable: true }))).metadata?.resultVerification as JsonObject).status).toBe("no_result");
  });

  it("writes the same status onto the run detail a reader of the run sees", async () => {
    const context = harness({ withProvider: false });
    await verify(context);
    expect((context.saved.at(-1)?.metadata?.resultVerification as JsonObject).status).toBe("unverified");
  });

  it("leaves a run that already failed alone, and asks nothing", async () => {
    const context = harness({ answer: ANSWER.no });
    const next = await verify(context, { session: session({ status: "failed" }) });
    expect(next.status).toBe("failed");
    expect(next.metadata?.resultVerification).toBeUndefined();
    expect(context.written).toHaveLength(0);
    expect(context.requests).toHaveLength(0);
  });
});
