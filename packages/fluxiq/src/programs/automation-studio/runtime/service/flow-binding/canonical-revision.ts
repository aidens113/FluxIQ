import { AutomationStudioProjectFlowResourceRepository, type AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

export async function automationStudioCanonicalFlowSettingsRevision(
  pool: AutomationStudioProjectDatabasePool,
  projectId: string,
  flowId: string
): Promise<number> {
  const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId });
  try {
    const persisted = await repository.getFlow(flowId);
    if (!persisted) throw new Error(`Flow ${flowId} has no canonical settings revision.`);
    return persisted.settingsRevision;
  } finally {
    await repository.close();
  }
}
