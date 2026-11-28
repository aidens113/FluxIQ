/** The name of the project the top bar has open, for the chat's heading. Null with none open or not yet loaded. */
export function openProjectName(projects: readonly { id: string; name: string }[], projectId: string | undefined): string | null {
  if (!projectId) return null;
  return projects.find((project) => project.id === projectId)?.name ?? null;
}
