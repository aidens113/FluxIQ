/**
 * This Flow's graph editor, under the editor's Advanced section: the canvas and step details for
 * one Flow (`app/(panel)/flows/[flowId]/graph`). The project travels with it so the page opens at once.
 */
export function graphEditorHref(projectId: string, flowId: string): string {
  const query = new URLSearchParams({ project: projectId });
  return `/flows/${encodeURIComponent(flowId)}/graph?${query.toString()}`;
}
