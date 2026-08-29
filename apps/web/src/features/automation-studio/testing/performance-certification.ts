import type { AutomationStudioRenderBoundary } from "../development/render-certification";

export const AUTOMATION_STUDIO_CERTIFICATION_PROFILES = ["empty", "small", "scale"] as const;
export type AutomationStudioCertificationProfile = typeof AUTOMATION_STUDIO_CERTIFICATION_PROFILES[number];

export const AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS = {
  "project.open": { durationMs: 1000, profiles: ["empty", "small", "scale"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "project.close": { durationMs: 100, profiles: ["empty", "small", "scale"], evidence: ["longTasks", "dom", "renders"] },
  "project.switch": { durationMs: 1000, profiles: ["small", "scale"], evidence: ["requests", "longTasks", "dom", "renders", "heap"] },
  "hierarchy.rowClick": { durationMs: 100, profiles: ["small", "scale"], evidence: ["requests", "longTasks", "renders"] },
  "hierarchy.folderToggle": { durationMs: 50, profiles: ["small", "scale"], evidence: ["longTasks", "renders"] },
  "view.coldOpen": { durationMs: 100, profiles: ["empty", "small", "scale"], evidence: ["requests", "longTasks", "renders"] },
  "view.warmSwitch": { durationMs: 16, profiles: ["empty", "small", "scale"], evidence: ["longTasks", "renders"] },
  "overlay.open": { durationMs: 50, profiles: ["empty", "small", "scale"], evidence: ["longTasks", "renders"] },
  "overlay.type": { durationMs: 50, profiles: ["empty", "small", "scale"], evidence: ["longTasks", "renders"] },
  "graph.select": { durationMs: 75, profiles: ["small", "scale"], evidence: ["longTasks", "renders"] },
  "graph.drag": { durationMs: 350, profiles: ["small", "scale"], evidence: ["longTasks", "renders"] },
  "graph.save": { durationMs: 1000, profiles: ["small", "scale"], evidence: ["requests", "longTasks", "renders"] },
  "graph.rightDragSelection": { durationMs: 350, profiles: ["small", "scale"], evidence: ["longTasks", "renders"] },
  "workspace.resize": { durationMs: 50, profiles: ["empty", "small", "scale"], evidence: ["longTasks", "renders"] },
  "hierarchy.createFlow": { durationMs: 700, profiles: ["small"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "hierarchy.deleteFlow": { durationMs: 700, profiles: ["small"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "hierarchy.createFolder": { durationMs: 400, profiles: ["small"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "hierarchy.deleteFolder": { durationMs: 400, profiles: ["small"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "runtime.listOpen": { durationMs: 500, profiles: ["small", "scale"], evidence: ["requests", "longTasks", "dom", "renders"] },
  "runtime.runLogOpen": { durationMs: 600, profiles: ["small", "scale"], evidence: ["requests", "longTasks", "dom", "renders"] },
} as const satisfies Record<string, {
  durationMs: number;
  profiles: readonly AutomationStudioCertificationProfile[];
  evidence: readonly ("requests" | "longTasks" | "dom" | "renders" | "heap")[];
}>;

export type AutomationStudioCertificationScenario = keyof typeof AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS;

export const AUTOMATION_STUDIO_RENDER_ISOLATION: Partial<Record<AutomationStudioCertificationScenario, {
  allowed: readonly AutomationStudioRenderBoundary[];
  forbidden: readonly AutomationStudioRenderBoundary[];
}>> = {
  "hierarchy.folderToggle": {
    allowed: ["AutomationStudioHierarchyBoundary"],
    forbidden: ["AutomationStudioLive", "AutomationStudioWorkspaceBoundary", "AutomationStudioPaneBoundary", "AutomationStudioOverlayBoundary", "AutomationStudioSelectionBoundary"],
  },
  "overlay.open": {
    allowed: ["AutomationStudioOverlayBoundary"],
    forbidden: ["AutomationStudioLive", "AutomationStudioWorkspaceBoundary", "AutomationStudioHierarchyBoundary", "AutomationStudioPaneBoundary", "AutomationStudioSelectionBoundary"],
  },
  "overlay.type": {
    allowed: ["AutomationStudioOverlayBoundary"],
    forbidden: ["AutomationStudioLive", "AutomationStudioWorkspaceBoundary", "AutomationStudioHierarchyBoundary", "AutomationStudioPaneBoundary", "AutomationStudioSelectionBoundary"],
  },
  "graph.select": {
    allowed: ["AutomationStudioSelectionBoundary", "AutomationStudioPaneBoundary"],
    forbidden: ["AutomationStudioLive", "AutomationStudioWorkspaceBoundary", "AutomationStudioHierarchyBoundary", "AutomationStudioOverlayBoundary"],
  },
  "graph.rightDragSelection": {
    allowed: ["AutomationStudioSelectionBoundary", "AutomationStudioPaneBoundary"],
    forbidden: ["AutomationStudioLive", "AutomationStudioWorkspaceBoundary", "AutomationStudioHierarchyBoundary", "AutomationStudioOverlayBoundary"],
  },
};

export function missingCertificationCoverage(
  recorded: Readonly<Record<string, unknown>>,
  profile: AutomationStudioCertificationProfile,
): AutomationStudioCertificationScenario[] {
  return (Object.entries(AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS) as Array<[
    AutomationStudioCertificationScenario,
    (typeof AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS)[AutomationStudioCertificationScenario],
  ]>)
    .filter(([, contract]) => (contract.profiles as readonly AutomationStudioCertificationProfile[]).includes(profile))
    .map(([scenario]) => scenario)
    .filter((scenario) => !(scenario in recorded));
}