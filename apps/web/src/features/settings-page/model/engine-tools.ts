export type EngineTool = { programId: string; name: string; explanation: string };

/** The existing program pages, unchanged and out of the main navigation. */
export const ENGINE_TOOLS: readonly EngineTool[] = Object.freeze([
  { programId: "background-tasks", name: "Background Tasks", explanation: "Jobs the engine runs on its own." },
  { programId: "deployment-sync", name: "Deployment Sync", explanation: "Copies a build to a target." },
  { programId: "database-manager", name: "Database Manager", explanation: "Browse the engine's stored records." },
  { programId: "docs", name: "Docs", explanation: "The engine's own documentation." },
  { programId: "runtime", name: "Runtime", explanation: "What the engine is running right now." },
  { programId: "compute-control", name: "Compute Control", explanation: "The machines that do the work." },
  { programId: "production-runner", name: "Production Runner", explanation: "Start and stop production runs." },
  { programId: "identity-access", name: "Identity & Access", explanation: "People, roles and sessions." },
  { programId: "secret-keys", name: "Secret Keys", explanation: "Every stored key, including ones that are not for AI." }
]);

export const engineToolHref = (tool: EngineTool): string => `/programs/${tool.programId}`;
