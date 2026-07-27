import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types";

export type AutomationStudioRepository<TDocument> = {
  list(domainId?: string | null): Promise<TDocument[]>;
  get(id: string, domainId?: string | null): Promise<TDocument | null>;
  put(document: TDocument): Promise<TDocument>;
  delete(id: string, domainId?: string | null): Promise<boolean>;
};

export type AutomationStudioRepositories = {
  tasks: AutomationStudioRepository<AutomationTask>;
  recordings: AutomationStudioRepository<AutomationRecording>;
  policies: AutomationStudioRepository<DynamicPolicyArtifact>;
};
