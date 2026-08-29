export const AUTOMATION_STUDIO_RENDER_BOUNDARIES = [
  "AutomationStudioLive",
  "AutomationStudioWorkspaceBoundary",
  "AutomationStudioHierarchyBoundary",
  "AutomationStudioPaneBoundary",
  "AutomationStudioOverlayBoundary",
  "AutomationStudioSelectionBoundary",
] as const;

export type AutomationStudioRenderBoundary = typeof AUTOMATION_STUDIO_RENDER_BOUNDARIES[number];

export type AutomationStudioRenderMetric = {
  component: string;
  count: number;
  recordedAt: number;
};

export type AutomationStudioRenderWindow = {
  counts: Record<string, number>;
  missingBoundaries: AutomationStudioRenderBoundary[];
  unexpectedBoundaries: string[];
};

export function summarizeAutomationStudioRenderWindow(
  metrics: readonly AutomationStudioRenderMetric[],
  expectedBoundaries: readonly AutomationStudioRenderBoundary[] = AUTOMATION_STUDIO_RENDER_BOUNDARIES,
): AutomationStudioRenderWindow {
  const counts: Record<string, number> = {};
  for (const metric of metrics) counts[metric.component] = (counts[metric.component] ?? 0) + 1;
  const expected = new Set<string>(expectedBoundaries);
  return {
    counts,
    missingBoundaries: expectedBoundaries.filter((boundary) => !(boundary in counts)),
    unexpectedBoundaries: Object.keys(counts).filter((boundary) => boundary.startsWith("AutomationStudio") && !expected.has(boundary)).sort(),
  };
}

export function renderCountFor(window: AutomationStudioRenderWindow, boundary: AutomationStudioRenderBoundary): number {
  return window.counts[boundary] ?? 0;
}