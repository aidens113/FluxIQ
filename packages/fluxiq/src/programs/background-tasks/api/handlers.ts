import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
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
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.detail,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload as BackgroundTaskDetailRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.detail(payload.taskId, payload.limit) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.run,
    permission: "runtime.control",
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
    handler: async (request) => {
      const payload = request.payload as ControlBackgroundTaskRequest | undefined;
      if (payload?.action === "start") return { ok: true, payload: await service.start() };
      if (payload?.action === "stop") return { ok: true, payload: await service.stop() };
      return { ok: false, error: "action must be start or stop" };
    }
  });
}
