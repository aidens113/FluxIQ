import type { ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import { AutomationStudioGatewayTraceProjectStore } from "./project-store.ts";
import { AutomationStudioGatewayTraceServicePools } from "./service-pools.ts";

/**
 * The trace store a host's episodes write `projectId`'s traces through, for the
 * Automation Studio service `owner` (traces and offline trials, P5): over the
 * service's own per-project pool and sealed with its project content
 * protection, exactly as the host's wiring opens it (`./host.ts`,
 * `./project-store.ts`), so a reader outside the web process reads a recorded
 * trace as the host wrote it. Undefined for an owner without project storage.
 */
export function automationStudioGatewayTraceServiceStore(owner: object, projectId: string): ClientGatewayTraceStore | undefined {
  const pool = AutomationStudioGatewayTraceServicePools.of(owner);
  return pool === undefined ? undefined : new AutomationStudioGatewayTraceProjectStore({ pool, projectId, protection: AutomationStudioGatewayTraceServicePools.protectionOf(pool) });
}
