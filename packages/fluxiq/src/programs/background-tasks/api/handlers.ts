import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { backgroundTaskDetailInput, backgroundTasksSnapshotInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../_shared/iam/index.ts";
import {
  BACKGROUND_TASKS_ENDPOINTS,
  type BackgroundTaskDetailRequest,
  type ControlBackgroundTaskRequest,
  type RunBackgroundTaskRequest,
  type SaveBackgroundTaskScheduleRequest,
  type SetBackgroundTaskEnabledRequest
} from "./contracts.ts";
import type { BackgroundTasksService } from "../runtime/service.ts";

export function registerBackgroundTasksApi(registry: GlobalProgramApiRegistry, service: BackgroundTasksService): void {
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    action: "ops:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { input: backgroundTasksSnapshotInput, summary: "Lists the engine's background tasks and how their last runs went.", phrases: ["show background tasks", "what is running in the background"] },
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.detail,
    permission: "programs.read",
    classification: "read",
    action: "ops:Detail",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { input: backgroundTaskDetailInput, summary: "Shows one background task with a page of its runs.", phrases: ["show this background task's runs"] },
    handler: async (request) => {
      const payload = request.payload as BackgroundTaskDetailRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.detail(payload.taskId, payload.limit, payload.offset, payload.status) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.run,
    permission: "runtime.control",
    classification: "authoring",
    action: "ops:Run",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator starts a background task by hand; a person does not ask for that in words." },
    handler: async (request) => {
      const payload = request.payload as RunBackgroundTaskRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.run(payload.taskId, payload.payload) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.setEnabled,
    permission: "runtime.control",
    classification: "authoring",
    action: "ops:SetEnabled",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator switches a background task on or off; a person does not ask for that in words." },
    handler: async (request) => {
      const payload = request.payload as SetBackgroundTaskEnabledRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.setEnabled(payload.taskId, Boolean(payload.enabled)) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.saveSchedule,
    permission: "runtime.control",
    classification: "authoring",
    action: "ops:SaveSchedule",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator changes how often a background task runs; a person does not ask for that in words." },
    handler: async (request) => {
      const payload = request.payload as SaveBackgroundTaskScheduleRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.saveSchedule(payload) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.control,
    permission: "runtime.control",
    classification: "authoring",
    action: "ops:Control",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator starts or stops the whole background task engine; a person does not ask for that in words." },
    handler: async (request) => {
      const payload = request.payload as ControlBackgroundTaskRequest | undefined;
      if (payload?.action === "start") return { ok: true, payload: await service.start() };
      if (payload?.action === "stop") return { ok: true, payload: await service.stop() };
      return { ok: false, error: "action must be start or stop" };
    }
  });
}
