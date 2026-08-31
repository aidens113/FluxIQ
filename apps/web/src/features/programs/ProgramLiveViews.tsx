"use client";

import dynamic from "next/dynamic";
import type { CurrentUser } from "./types";
import { Panel } from "./shared-ui";
import { useUiRenderMetric } from "./ui-performance";

const AutomationStudioLive = dynamic(
  () => import("../automation-studio/AutomationStudioLive").then((module) => module.AutomationStudioLive),
  { loading: ProgramViewLoading }
);
const BackgroundTasksLive = dynamic(
  () => import("./live-views/background-tasks").then((module) => module.BackgroundTasksLive),
  { loading: ProgramViewLoading }
);
const ComputeControlLive = dynamic(
  () => import("./live-views/compute-control").then((module) => module.ComputeControlLive),
  { loading: ProgramViewLoading }
);
const DatabaseManagerLive = dynamic(
  () => import("./live-views/database-manager").then((module) => module.DatabaseManagerLive),
  { loading: ProgramViewLoading }
);
const DeploymentSyncLive = dynamic(
  () => import("./live-views/deployment-sync").then((module) => module.DeploymentSyncLive),
  { loading: ProgramViewLoading }
);
const DocsLive = dynamic(
  () => import("./live-views/docs").then((module) => module.DocsLive),
  { loading: ProgramViewLoading }
);
const IdentityAccessLive = dynamic(
  () => import("./live-views/identity-access").then((module) => module.IdentityAccessLive),
  { loading: ProgramViewLoading }
);
const ProductionRunnerLive = dynamic(
  () => import("./live-views/production-runner").then((module) => module.ProductionRunnerLive),
  { loading: ProgramViewLoading }
);
const SecretKeysLive = dynamic(
  () => import("./live-views/secret-keys").then((module) => module.SecretKeysLive),
  { loading: ProgramViewLoading }
);

export function LiveProgramMain({ programId, user }: { programId: string; user: CurrentUser }) {
  useUiRenderMetric(`LiveProgramMain:${programId}`);
  switch (programId) {
    case "automation-studio": return <AutomationStudioLive currentUser={user} />;
    case "identity-access": return <IdentityAccessLive currentUser={user} />;
    case "database-manager": return <DatabaseManagerLive currentUser={user} />;
    case "background-tasks": return <BackgroundTasksLive />;
    case "compute-control": return <ComputeControlLive />;
    case "deployment-sync": return <DeploymentSyncLive />;
    case "docs": return <DocsLive />;
    case "production-runner": return <ProductionRunnerLive />;
    case "secret-keys": return <SecretKeysLive currentUser={user} />;
    default: return <Panel title="Workspace"><p className="muted-text">This program is registered but does not expose a live workspace yet.</p></Panel>;
  }
}

function ProgramViewLoading() {
  return <div aria-live="polite" className="program-view-loading" role="status"><span /><strong>Loading workspace</strong></div>;
}
