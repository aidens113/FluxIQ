// A project's tasks, read from what each task remembers (`answer-first/task-memory`): the list with each task's
// latest attempt, a person's own name for a task, and forgetting one.
//
// **Rename and remove touch only the task's own memory entry.** Never a Flow, a saved part, a result or an attempt
// row. Removing leaves the attempts readable by Flow and by thread (the chat still tells them) and leaves the Flow
// and its saved parts as they were; what goes is the task's notes, the steps it remembers for a later attempt, and
// the index lines that name its attempts. A repeat of the same words then starts a new entry, and works out its
// steps again rather than from what was forgotten. Nothing dangles: no other record points at a memory entry.
//
// **These assert the project's domain access**, as the attempt reads do: a result holds rows, which are page content.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import type { ProgramApiResponse } from "../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type ListProjectTasksRequest, type RemoveTaskRequest, type RenameTaskRequest } from "../../../../../api-contracts/automation.ts";
import { AutomationStudioAnswerFirstAttemptLocatorUnreadable, AutomationStudioAnswerFirstAttemptsUnreadable } from "../../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstProjectTasks, automationStudioAnswerFirstTaskMemoryOf } from "../../../../../framework/automation-service/service/answer-first/task-memory/index.ts";
import { boundedIdentifier } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";
import { automationStudioApiTaskOutcomesWithProvenance } from "./attempt-provenance.ts";
import { automationStudioApiTaskOutcomeSource } from "./attempt-store.ts";

const UNREADABLE = "What was kept of your tasks could not be read, so I cannot list them.";
const NOT_FOUND = "I could not find that task.";
const TITLE_LIMIT = 120;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function registerProjectTaskEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  const memoryOf = () => automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListProjectTasks",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = bodyOf<ListProjectTasksRequest>(request.payload);
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const limit = typeof payload.limit === "number" && Number.isInteger(payload.limit) && payload.limit > 0 ? Math.min(payload.limit, MAX_LIMIT) : DEFAULT_LIMIT;
      const start = typeof payload.cursor === "string" && /^\d+$/u.test(payload.cursor) ? Number(payload.cursor) : 0;
      return await unreadableRefused(async () => {
        const flowNames = new Map((await service.listFlows(projectId)).map((entry) => [entry.flow.flowId, entry.flow.name]));
        const tasks = await automationStudioAnswerFirstProjectTasks({ memory: memoryOf(), source: automationStudioApiTaskOutcomeSource(service), flowNames }, projectId);
        const page = tasks.slice(start, start + limit);
        const told = await automationStudioApiTaskOutcomesWithProvenance(service, projectId, page.map((task) => task.latest));
        return { ok: true, payload: { tasks: page.map((task, at) => ({ ...task, latest: told[at] ?? task.latest })), nextCursor: start + limit < tasks.length ? String(start + limit) : null } };
      });
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.renameTask,
    permission: "programs.write",
    classification: "authoring",
    action: "studio:RenameTask",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = bodyOf<RenameTaskRequest>(request.payload);
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const taskId = boundedIdentifier(payload.taskId, "Task");
      const title = typeof payload.title === "string" ? payload.title.replace(/\s+/gu, " ").trim().slice(0, TITLE_LIMIT) : "";
      if (title === "") return { ok: false, error: "A task needs a name with words in it.", errorCode: "task.title_required" };
      const memory = memoryOf();
      if (!(await memory.get(projectId, taskId))) return { ok: false, error: NOT_FOUND, errorCode: "task.not_found" };
      await memory.update(projectId, taskId, (current) => ({ ...current, title }));
      return { ok: true, payload: { taskId, title } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.removeTask,
    permission: "programs.write",
    // Authoring and not destructive: it forgets one memory entry and no Flow, saved part, result or attempt row (above).
    classification: "authoring",
    action: "studio:RemoveTask",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = bodyOf<RemoveTaskRequest>(request.payload);
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const taskId = boundedIdentifier(payload.taskId, "Task");
      if (!(await memoryOf().remove(projectId, taskId))) return { ok: false, error: NOT_FOUND, errorCode: "task.not_found" };
      return { ok: true, payload: { taskId, removed: true } };
    }
  });
}

/** Refuses, in words, a read that met a file it could not read. Anything else is the registry's to report. */
async function unreadableRefused(read: () => Promise<ProgramApiResponse>): Promise<ProgramApiResponse> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AutomationStudioAnswerFirstAttemptsUnreadable || error instanceof AutomationStudioAnswerFirstAttemptLocatorUnreadable) return { ok: false, error: UNREADABLE, errorCode: "task_attempt.unreadable" };
    throw error;
  }
}

function bodyOf<TRequest>(payload: unknown): Partial<TRequest> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as Partial<TRequest> : {};
}
