import {
  type AutomationStudioViewId,
  type AutomationViewDefinitionById
} from "../../views/canonical-view-definitions";
import type { HostBindingOf } from "../../views/view-definition-types";
import type { AutomationViewInstance } from "../../views/view-types";
import type { AutomationViewReadiness } from "../../views/view-readiness";
import type { AutomationWorkspaceViewEntry, AutomationWorkspaceViewSource } from "../../workspace/shell/contracts";

export type CanonicalViewHostKind<Id extends AutomationStudioViewId> = AutomationViewDefinitionById<Id>["kind"];
export type AutomationViewCompositionActivity = "active" | "warm" | "inactive" | "unavailable";
export type AutomationCanonicalViewHostInput<Id extends AutomationStudioViewId> = {
  model: HostBindingOf<AutomationViewDefinitionById<Id>>["model"];
  commands: HostBindingOf<AutomationViewDefinitionById<Id>>["commands"];
  activity: AutomationViewCompositionActivity;
  label?: string;
  state?: AutomationViewInstance["state"];
  bodyClassName?: string;
  readiness?: AutomationViewReadiness<HostBindingOf<AutomationViewDefinitionById<Id>>["model"]>;
};
export type AutomationCanonicalViewHostInputs = Partial<{
  [Id in AutomationStudioViewId]: AutomationCanonicalViewHostInput<Id>;
}>;

export type AutomationViewHostCompositionSnapshot = {
  projectKey: string | null;
  views: AutomationCanonicalViewHostInputs;
  requestedViewIds?: readonly string[];
};
export type AutomationViewHostRecovery =
  | { status: "migrated"; requestedId: string; canonicalId: AutomationStudioViewId }
  | { status: "retired"; requestedId: string; replacementId: AutomationStudioViewId }
  | { status: "unknown"; requestedId: string };
export type AutomationViewHostPublicationResult = {
  generation: number;
  projectChanged: boolean;
  cancelled: boolean;
  published: number;
  reused: number;
  removed: number;
  ignoredRequestedViews: number;
  recoveries: readonly AutomationViewHostRecovery[];
};
export type AutomationViewHostComposition = {
  readonly source: AutomationWorkspaceViewSource;
  getProjectKey(): string | null;
  publish(snapshot: AutomationViewHostCompositionSnapshot): Promise<AutomationViewHostPublicationResult>;
  resetProject(projectKey: string | null): number;
  dispose(): void;
};
export type AutomationViewHostCompositionOptions = {
  source?: AutomationWorkspaceViewSource;
  batchSize?: number;
  maxRequestedViews?: number;
  schedule?: (task: () => void) => void;
};
export type AutomationPublishedViewRecord = {
  canonicalId: AutomationStudioViewId;
  requestedId: string;
  kind: CanonicalViewHostKind<AutomationStudioViewId>;
  input: AutomationCanonicalViewHostInput<AutomationStudioViewId>;
  entry: AutomationWorkspaceViewEntry;
};
