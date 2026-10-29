import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../../types.ts";
import type { LearnedTaskModel } from "../../learning/index.ts";
import type { NormalizedTimeline } from "../../normalization/index.ts";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../../model/index.ts";

export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  /** Null is a global project; a string scopes the project to one host domain. */
  domainId?: string | null;
  categoryId?: string | null;
  /**
   * The Identity Access user who owns the project, which `FluxIQUserAccess`
   * matches against the caller (`fluxiq:ResourceOwner`); the project's flows,
   * recordings, runs and datasets are owned by the same user. Kept beside the
   * project rather than in its runtime record (`api/ownership/`), so it is
   * present only on answers that add it: absent means not looked up, null
   * means the project has no owner yet (no workspace owner and no enabled
   * `admin` to default to).
   */
  ownerUserId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  domainId?: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioSnapshot = {
  tasks: AutomationTask[];
  recordings: AutomationRecording[];
  policies: DynamicPolicyArtifact[];
  canonical?: {
    recordingSessions: RecordingSession[];
    normalizedTimelines: NormalizedTimeline[];
    signalRegistries: SignalRegistry[];
    learnedTaskModels: LearnedTaskModel[];
    policyGraphs: PolicyGraph[];
  };
  problems?: AutomationStudioProblem[];
};

export type AutomationStudioProblem = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  artifactKind?: string;
  artifactId?: string;
};
