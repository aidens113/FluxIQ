"use client";

import { AutomationStudioLive } from "../automation-studio/AutomationStudioLive";
import type { CurrentUser } from "./types";
import {
  BackgroundTasksLive,
  ComputeControlLive,
  DatabaseManagerLive,
  DeploymentSyncLive,
  DocsLive,
  IdentityAccessLive,
  ProductionRunnerLive
} from "./live-views";
import { Panel } from "./shared-ui";

export function LiveProgramMain({ programId, user }: { programId: string; user: CurrentUser }) {
  switch (programId) {
    case "automation-studio": return <AutomationStudioLive currentUser={user} />;
    case "identity-access": return <IdentityAccessLive currentUser={user} />;
    case "database-manager": return <DatabaseManagerLive currentUser={user} />;
    case "background-tasks": return <BackgroundTasksLive />;
    case "compute-control": return <ComputeControlLive />;
    case "deployment-sync": return <DeploymentSyncLive />;
    case "docs": return <DocsLive />;
    case "production-runner": return <ProductionRunnerLive />;
    default: return <Panel title="Workspace"><p className="muted-text">This program is registered but does not expose a live workspace yet.</p></Panel>;
  }
}
