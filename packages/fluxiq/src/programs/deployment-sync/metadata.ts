import type { GlobalProgramDefinition } from "../_shared/types.ts";

export const DEPLOYMENT_SYNC_PROGRAM: GlobalProgramDefinition = {
  id: "deployment-sync",
  title: "Deployment Sync",
  category: "Framework Control",
  description: "Track framework deployments, artifact sync status, and rollout metadata.",
  icon: "cloud-upload",
  status: "preview"
};
