// Which Automation Studio endpoints assert the project's domain scope, and why
// the rest do not.
//
// A request's domain is whatever `?domainId=` says on the URL
// (`apps/web/src/lib/program-route.ts`, `programDomainScope`), and any
// authenticated actor can name any domain. So `assertProjectDomainAccess` is
// not an authorization gate against a hostile caller — it cannot be one. It
// binds a request to the domain surface it claims to be working in, so that a
// domain-scoped client (Automation Studio opened at `?domainId=...`, or a
// domain's own runtime adapter) cannot be pointed at another domain's project
// and pull that project's **stored content** out of it.
//
// That is why the line falls where it does. A dataset row is raw page content,
// stored unstripped (CD16); a reusable LLM context record is sanitized
// evidence pooled across runs. Both assert. The run, flow, recording and
// project endpoints do not, and are safe without it because they carry no
// stored content to leak: an attempt's captured rows are replaced by a
// `$dataset` marker (`runtime/service/summaries/conversions.ts`,
// `datasetMarkerRecordCount`), a run's input values are replaced by the
// withheld marker when the session starts (`runtime/service.ts`) and again in
// the stored envelope (`storage/project/runtime-stream-store.ts`,
// `withheldRunInputs`), and a capture's `outputs.result` and `records` are
// withheld before the trace is stored (`runtime/executor/record-capture.ts`).
//
// This suite pins the set, in the spirit of
// `programs/tests/endpoint-classification.test.ts`: adding an endpoint that
// returns stored project content without the assertion, or adding the
// assertion to one that returns structure, changes the list below, and
// changing it is then a deliberate edit with this rule next to it. The set is
// observed by calling every registered endpoint rather than by reading the
// source, so an endpoint that asserts only on some paths does not pass as one
// that asserts.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import type { ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../../framework/automation-service/index.ts";
import { registerAutomationStudioApi } from "../index.ts";

/**
 * Every endpoint that refuses a project outside the request's domain scope:
 * the six run-dataset endpoints, the seven reusable LLM context endpoints, the
 * eight conversation endpoints (a rename or a delete asserts when it names its
 * project; without one it searches the domain's projects as the listing does), the task-attempt endpoints, whose results hold
 * rows, and a project's tasks: their list shows each task's latest result, and
 * a rename or removal changes what a task remembers of that page content, as
 * `put-reusable-llm-context` and `append-turn` do; and a project's library of
 * saved parts: a run hands back values a part read from a page, a card names its
 * sites and purpose in the words of whoever saved it, and a save keeps one. Each
 * one returns, changes, deletes or counts content captured from somewhere else.
 *
 * A thread is on the list because it holds free text and some of that text
 * came out of a domain -- the control named on a permission ask, the sentence
 * Core built around it, and whatever a person typed back. `listConversations`
 * is here too, because this suite names a project and it asserts whenever one
 * is named. Called with `projectId: null` it asserts nothing and cannot: there
 * is no project to assert about, and it searches exactly the projects
 * `listProjects` returns for the request's domain, which is the same
 * entitlement the `projects` endpoint grants.
 */
const DOMAIN_SCOPED = [
  AUTOMATION_STUDIO_ENDPOINTS.listRunDatasets,
  AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage,
  AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset,
  AUTOMATION_STUDIO_ENDPOINTS.deleteRunDatasets,
  AUTOMATION_STUDIO_ENDPOINTS.listProjectDatasets,
  AUTOMATION_STUDIO_ENDPOINTS.listDatasetRuns,
  AUTOMATION_STUDIO_ENDPOINTS.listReusableLlmContexts,
  AUTOMATION_STUDIO_ENDPOINTS.getReusableLlmContext,
  AUTOMATION_STUDIO_ENDPOINTS.putReusableLlmContext,
  AUTOMATION_STUDIO_ENDPOINTS.deleteReusableLlmContext,
  AUTOMATION_STUDIO_ENDPOINTS.clearReusableLlmContextScope,
  AUTOMATION_STUDIO_ENDPOINTS.purgeExpiredReusableLlmContexts,
  AUTOMATION_STUDIO_ENDPOINTS.packReusableLlmContexts,
  AUTOMATION_STUDIO_ENDPOINTS.listConversations,
  AUTOMATION_STUDIO_ENDPOINTS.openConversation,
  AUTOMATION_STUDIO_ENDPOINTS.renameConversation,
  AUTOMATION_STUDIO_ENDPOINTS.deleteConversation,
  AUTOMATION_STUDIO_ENDPOINTS.getConversation,
  AUTOMATION_STUDIO_ENDPOINTS.getConversationAttachment,
  AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
  AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
  AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt,
  AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts,
  AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow,
  AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt,
  AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks,
  AUTOMATION_STUDIO_ENDPOINTS.renameTask,
  AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings,
  AUTOMATION_STUDIO_ENDPOINTS.removeTask,
  AUTOMATION_STUDIO_ENDPOINTS.listProjectParts,
  AUTOMATION_STUDIO_ENDPOINTS.getProjectPart,
  AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart,
  AUTOMATION_STUDIO_ENDPOINTS.runProjectPart
].sort();

const DOMAIN_REFUSED = "Automation Studio project is unavailable in this domain scope.";

/**
 * A service that answers anything. Every property is a callable stand-in that
 * returns another one, so a handler reaches its scope assertion whatever it
 * touches on the way; `then` is deliberately absent so awaiting one resolves
 * to itself rather than hanging. A handler that then fails on the shape of an
 * answer is fine here — this suite reads only whether the scope was asserted,
 * which happens first or not at all.
 */
function answeringService(assertProjectDomainAccess: () => Promise<void>): AutomationStudioService {
  const anything = (): unknown => new Proxy(function stub() {}, {
    get: (_target, property) => (typeof property === "symbol" || property === "then" ? undefined : anything()),
    apply: () => anything()
  });
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "assertProjectDomainAccess") return assertProjectDomainAccess;
      if (typeof property === "symbol" || property === "then") return undefined;
      return anything();
    }
  }) as unknown as AutomationStudioService;
}

/** A payload naming every identifier a handler might read, so none of them stops before its scope check. */
const PAYLOAD = {
  projectId: "project.one",
  runId: "run.one",
  flowId: "flow.one",
  subflowId: "subflow.one",
  datasetId: "dataset.one",
  recordId: "record.one",
  recordingId: "recording.one",
  proposalId: "proposal.one",
  adaptationId: "adaptation.one",
  artifactId: "artifact.one",
  categoryId: "category.one",
  nodeId: "node.one",
  sessionId: "session.one",
  attemptId: "attempt.one",
  conversationId: "conversation.one",
  title: "Title one",
  format: "csv",
  action: "reject",
  authSessionId: "session.user.every",
  authorizationPin: "123456"
};

/** The endpoints that asserted the project's domain scope when called under a scope the project does not belong to. */
async function endpointsAssertingDomainScope(): Promise<string[]> {
  const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
  const asserted: string[] = [];
  let current = "";
  const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin } as never });
  registerAutomationStudioApi(registry, answeringService(async () => {
    asserted.push(current);
    throw new Error(DOMAIN_REFUSED);
  }));
  const endpoints = registry.endpoints();
  const actor: ProgramApiActor = {
    sessionId: "session.user.every",
    userId: "user.every",
    roleId: "admin",
    permissions: [...new Set(endpoints.map((endpoint) => endpoint.permission))]
  };
  for (const { endpoint } of endpoints) {
    current = endpoint;
    await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "other-domain" }, actor, payload: PAYLOAD });
  }
  return [...new Set(asserted)].sort();
}

describe("Automation Studio project domain scope", () => {
  it("asserts the project's domain scope on exactly the endpoints that return stored project content", async () => {
    expect(await endpointsAssertingDomainScope()).toEqual(DOMAIN_SCOPED);
  });

  /**
   * The pair that disagreed, stated as behaviour rather than as a claim about
   * the source. `get-run-dataset-page` returns rows and refuses; the run detail
   * beside it returns structure and answers. A Lab reading a run's extraction
   * therefore has to present the project's domain on the dataset call and needs
   * nothing on the detail call, which is exactly what the two answers here say.
   */
  it("refuses a dataset page outside the project's domain, and answers a run detail whatever the scope", async () => {
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin } as never });
    const getFlowRunDetail = vi.fn().mockResolvedValue(null);
    const getRunDatasetPage = vi.fn().mockResolvedValue(null);
    registerAutomationStudioApi(registry, {
      assertProjectDomainAccess: async (_projectId: string, domainId?: string | null) => {
        if ((domainId ?? null) !== "web-automation") throw new Error(DOMAIN_REFUSED);
      },
      getFlowRunDetail,
      runDatasets: { getRunDatasetPage }
    } as unknown as AutomationStudioService);
    const actor: ProgramApiActor = { sessionId: "session.reader", userId: "user.reader", roleId: "admin", permissions: ["programs.read"] };
    const call = (endpoint: string, domainId: string | null) =>
      registry.call({ programId: "automation-studio", endpoint, scope: { domainId }, actor, payload: PAYLOAD });

    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage, null)).toMatchObject({ ok: false, error: DOMAIN_REFUSED });
    expect(getRunDatasetPage).not.toHaveBeenCalled();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage, "web-automation")).toMatchObject({ ok: true });

    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, null)).toMatchObject({ ok: true });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, "another-domain")).toMatchObject({ ok: true });
    expect(getFlowRunDetail).toHaveBeenCalledTimes(2);
  });
});
