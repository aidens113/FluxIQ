/** The editor's address for a Flow. The project rides along so the page never has to search for it. */
export function flowHref(flowId: string, projectId: string): string {
  return `/flows/${encodeURIComponent(flowId)}?project=${encodeURIComponent(projectId)}`;
}
