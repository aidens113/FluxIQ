// The project's library of saved parts: search it, read a part, keep a Subflow of a
// Flow as one, and run one. Thin on purpose: each handler names the fields it forwards and
// the service's `projectParts` does the work, so a body carries nothing else into it.
//
// **These assert the project's domain access**, as the dataset and task routes do, before anything
// else, and go on with the id they asserted. A run hands back values a part read from a page, and
// a card names the sites the part works on and what it is for in the words of whoever saved it.
// `service.projectParts` asserts nothing itself: a build and an attempt call it from inside the
// project they are already working in, and only these routes take a domain from a request.

import { AUTOMATION_STUDIO_ENDPOINTS, type GetProjectPartRequest, type ListProjectPartsRequest, type RunProjectPartRequest, type SaveProjectPartRequest } from "../../../../api-contracts/automation.ts";
import { boundedIdentifier } from "../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { ProgramApiRequest } from "../../../_shared/api.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";

type PartsAnswer = { ok: false; code: string; message: string; classes?: readonly string[] } | object;

export function registerProjectPartEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  const assertedProject = async (request: ProgramApiRequest): Promise<string> => {
    const projectId = boundedIdentifier(body(request.payload).projectId, "Project");
    await service.assertProjectDomainAccess(projectId, request.scope.domainId);
    return projectId;
  };
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectParts, assistant: { hidden: "Project parts are saved Subflows, which are being retired; people work with whole Flows instead." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListProjectParts",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const projectId = await assertedProject(request);
      return answer(await service.projectParts.list({ ...listRequest(request.payload), projectId }));
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectPart, assistant: { hidden: "Project parts are saved Subflows, which are being retired; people work with whole Flows instead." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetProjectPart",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const projectId = await assertedProject(request);
      return answer(await service.projectParts.get({ ...getRequest(request.payload), projectId }));
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectPart, assistant: { hidden: "Project parts are saved Subflows, which are being retired; people work with whole Flows instead." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:SaveProjectPart",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const projectId = await assertedProject(request);
      return answer(await service.projectParts.save({ ...saveRequest(request.payload), projectId }));
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runProjectPart, assistant: { hidden: "Project parts are saved Subflows, which are being retired; people work with whole Flows instead." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:RunProjectPart",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const projectId = await assertedProject(request);
      return answer(await service.projectParts.run({ ...runRequest(request.payload), projectId }));
    }
  });
}

/**
 * A refusal travels as the payload, `{ refused: true, code, message }`, so it reaches a client as the library
 * answered it: a relay keeps a failed response's error text and drops its code, and the screen reads the code.
 */
function answer(result: PartsAnswer) {
  const refusal = result as { ok?: unknown; code?: unknown; message?: unknown; classes?: unknown };
  return { ok: true as const, payload: refusal.ok === false ? { refused: true, code: String(refusal.code ?? ""), message: String(refusal.message ?? ""), ...(Array.isArray(refusal.classes) ? { classes: refusal.classes } : {}) } : result };
}

function body(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function words(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function listRequest(payload: unknown): Omit<ListProjectPartsRequest, "limit"> & { limit?: unknown } {
  const b = body(payload);
  return {
    projectId: String(b.projectId ?? ""),
    ...(text(b.query) !== undefined ? { query: text(b.query)! } : {}),
    ...(text(b.site) !== undefined ? { site: text(b.site)! } : {}),
    ...(words(b.inputName) !== undefined ? { inputName: words(b.inputName)! } : {}),
    ...(words(b.outputName) !== undefined ? { outputName: words(b.outputName)! } : {}),
    ...(words(b.lasting) !== undefined ? { lasting: words(b.lasting)! } : {}),
    ...(words(b.trust) !== undefined ? { trust: words(b.trust)! } : {}),
    ...(text(b.usedByFlowId) !== undefined ? { usedByFlowId: text(b.usedByFlowId)! } : {}),
    ...(text(b.sourceFlowId) !== undefined ? { sourceFlowId: text(b.sourceFlowId)! } : {}),
    ...(b.limit !== undefined ? { limit: b.limit } : {}),
    ...(typeof b.cursor === "string" || b.cursor === null ? { cursor: b.cursor } : {})
  };
}

function getRequest(payload: unknown): GetProjectPartRequest {
  const b = body(payload);
  return { projectId: String(b.projectId ?? ""), partId: String(b.partId ?? ""), ...(typeof b.version === "number" ? { version: b.version } : {}) };
}

function saveRequest(payload: unknown): SaveProjectPartRequest {
  const b = body(payload);
  return {
    projectId: String(b.projectId ?? ""),
    flowId: String(b.flowId ?? ""),
    subflowId: String(b.subflowId ?? ""),
    ...(text(b.name) !== undefined ? { name: text(b.name)! } : {}),
    ...(text(b.purpose) !== undefined ? { purpose: text(b.purpose)! } : {})
  };
}

function runRequest(payload: unknown): RunProjectPartRequest {
  const b = body(payload);
  const inputs = b.inputs && typeof b.inputs === "object" && !Array.isArray(b.inputs) ? b.inputs as NonNullable<RunProjectPartRequest["inputs"]> : undefined;
  const permitted = words(b.permittedConsequences);
  return {
    projectId: String(b.projectId ?? ""),
    partId: String(b.partId ?? ""),
    ...(typeof b.version === "number" ? { version: b.version } : {}),
    ...(inputs ? { inputs } : {}),
    ...(permitted !== undefined ? { permittedConsequences: Array.isArray(permitted) ? permitted : [permitted] } : {}),
    ...(b.acknowledgedRepeat === true ? { acknowledgedRepeat: true } : {}),
    ...(text(b.newRunId) !== undefined ? { newRunId: text(b.newRunId)! } : {})
  };
}
