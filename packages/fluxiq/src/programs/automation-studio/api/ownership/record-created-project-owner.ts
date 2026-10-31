import type { AutomationStudioService } from "../../runtime/index.ts";
import { AutomationStudioProjectOwnerships } from "./ownerships.ts";

/**
 * Records a project's creator for trusted in-process host initialization, without
 * creating a login session. The project must exist and its ownership resolver
 * must be registered. Repeating the same creator repairs partial initialization;
 * a different recorded creator is never replaced. This does not authorize a user
 * request: ordinary callers use the IAM-gated `create-project` endpoint.
 */
export async function recordAutomationStudioCreatedProjectOwner(service: AutomationStudioService, projectId: string, userId: string): Promise<void> {
  if (typeof userId !== "string" || userId.trim().length === 0) throw new Error("A project owner needs a nonempty user id.");
  const ownership = AutomationStudioProjectOwnerships.of(service);
  if (!ownership) throw new Error("Automation Studio project ownership is not registered for this service.");
  await ownership.recordOwner(projectId, userId);
}
