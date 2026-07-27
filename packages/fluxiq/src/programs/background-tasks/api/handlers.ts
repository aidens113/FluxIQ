import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { BACKGROUND_TASKS_ENDPOINTS, type RunBackgroundTaskRequest, type SetBackgroundTaskEnabledRequest } from "./contracts";
import type { BackgroundTasksService } from "../runtime/service";

export function registerBackgroundTasksApi(registry: GlobalProgramApiRegistry, service: BackgroundTasksService): void {
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.snapshot,
    handler: () => ({ ok: true, payload: service.snapshot() })
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.run,
    handler: async (request) => {
      const payload = request.payload as RunBackgroundTaskRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: await service.run(payload.taskId, payload.payload) };
    }
  });
  registry.register({
    programId: "background-tasks",
    endpoint: BACKGROUND_TASKS_ENDPOINTS.setEnabled,
    handler: (request) => {
      const payload = request.payload as SetBackgroundTaskEnabledRequest | undefined;
      if (!payload?.taskId) return { ok: false, error: "taskId is required" };
      return { ok: true, payload: service.setEnabled(payload.taskId, Boolean(payload.enabled)) };
    }
  });
}
