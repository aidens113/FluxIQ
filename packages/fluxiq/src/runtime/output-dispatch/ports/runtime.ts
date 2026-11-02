import type { RuntimeService } from "../../service.ts";
export type OutputDispatchRuntime = Pick<RuntimeService, "capabilities" | "dispatch">;
