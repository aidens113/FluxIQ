"use client";

// The engine tool a Settings sub-page shows, loaded only when that page opens.
// These are the views the retired /programs/<id> pages rendered, unchanged.

import dynamic from "next/dynamic";
import type { CurrentUser } from "../../programs/types";
import { Panel } from "../../programs/shared-ui";
import { useUiRenderMetric } from "../../programs/ui-performance";

const BackgroundTasksLive = dynamic(
  () => import("./background-tasks").then((module) => module.BackgroundTasksLive),
  { loading: ToolViewLoading }
);
const ComputeControlLive = dynamic(
  () => import("./compute-control").then((module) => module.ComputeControlLive),
  { loading: ToolViewLoading }
);
const DatabaseManagerLive = dynamic(
  () => import("./database-manager").then((module) => module.DatabaseManagerLive),
  { loading: ToolViewLoading }
);
const DeploymentSyncLive = dynamic(
  () => import("./deployment-sync").then((module) => module.DeploymentSyncLive),
  { loading: ToolViewLoading }
);
const DocsLive = dynamic(
  () => import("./docs").then((module) => module.DocsLive),
  { loading: ToolViewLoading }
);
const ProductionRunnerLive = dynamic(
  () => import("./production-runner").then((module) => module.ProductionRunnerLive),
  { loading: ToolViewLoading }
);
const RuntimeLive = dynamic(
  () => import("./runtime").then((module) => module.RuntimeLive),
  { loading: ToolViewLoading }
);

export function SettingsToolView({ toolId, user }: { toolId: string; user: CurrentUser }) {
  useUiRenderMetric(`SettingsToolView:${toolId}`);
  switch (toolId) {
    case "database-manager": return <DatabaseManagerLive currentUser={user} />;
    case "background-tasks": return <BackgroundTasksLive />;
    case "compute-control": return <ComputeControlLive />;
    case "deployment-sync": return <DeploymentSyncLive />;
    case "docs": return <DocsLive />;
    case "production-runner": return <ProductionRunnerLive />;
    case "runtime": return <RuntimeLive />;
    default: return <Panel title="Workspace"><p className="muted-text">This tool is registered but does not expose a live workspace yet.</p></Panel>;
  }
}

function ToolViewLoading() {
  return <div aria-live="polite" className="program-view-loading" role="status"><span /><strong>Loading workspace</strong></div>;
}
