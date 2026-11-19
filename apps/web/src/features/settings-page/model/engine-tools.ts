export type EngineTool = { id: string; name: string; explanation: string; href: string };

/**
 * The engine's own tools, each a Settings sub-page that renders the view its
 * retired /programs/<id> page rendered. `id` is that program's id, so
 * /programs/<id> redirects to `/settings/<id>`.
 */
export const SETTINGS_TOOLS: readonly EngineTool[] = Object.freeze([
  { id: "background-tasks", name: "Background Tasks", explanation: "Jobs the engine runs on its own.", href: "/settings/background-tasks" },
  { id: "deployment-sync", name: "Deployment Sync", explanation: "Copies a build to a target.", href: "/settings/deployment-sync" },
  { id: "database-manager", name: "Database Manager", explanation: "Browse the engine's stored records.", href: "/settings/database-manager" },
  { id: "docs", name: "Docs", explanation: "The engine's own documentation.", href: "/settings/docs" },
  { id: "runtime", name: "Runtime", explanation: "What the engine is running right now.", href: "/settings/runtime" },
  { id: "compute-control", name: "Compute Control", explanation: "The machines that do the work.", href: "/settings/compute-control" },
  { id: "production-runner", name: "Production Runner", explanation: "Start and stop production runs.", href: "/settings/production-runner" }
]);

/** The two Advanced tools that are about who and what you sign in as: the logins and keys your Flows use, and your own sign-in. */
export const SECURITY_TOOLS: readonly EngineTool[] = Object.freeze([
  { id: "secret-keys", name: "Saved logins and keys for Flows", explanation: "The logins and keys your Flows use on other sites and services: add, replace and remove them, and choose where each is used. AI keys are added above.", href: "/settings/saved-logins" },
  { id: "identity-access", name: "Your sign-in", explanation: "Your password, two-step sign-in and the places you are signed in.", href: "/security/sign-in" }
]);

/** Every engine tool, in the order Settings lists them. */
export const ENGINE_TOOLS: readonly EngineTool[] = Object.freeze([...SETTINGS_TOOLS, ...SECURITY_TOOLS]);

/** The Settings tool a `/settings/<id>` page shows, or nothing for an id that is not one. */
export function settingsTool(id: string): EngineTool | undefined {
  return SETTINGS_TOOLS.find((tool) => tool.id === id);
}
