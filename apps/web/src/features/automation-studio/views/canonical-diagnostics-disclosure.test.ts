import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationStudioViewDefinitionsList } from "./canonical-view-definitions";

type DiagnosticsPolicy = { kind: "disclosed" | "user-facing-only"; files: string[]; evidence?: string[] };

const policies: Record<string, DiagnosticsPolicy> = {
  "client-gateway": { kind: "disclosed", files: ["../clients/ClientGatewayView.tsx"], evidence: ["<details", "Connection details"] },
  "timeline-recording": { kind: "user-facing-only", files: ["../recordings/RecordingTimelineView.tsx"] },
  "flow-nodes": { kind: "user-facing-only", files: ["../flow-editor/FlowEditorView.tsx"] },
  "flow-router": { kind: "disclosed", files: ["../router/RouterContentView.tsx"], evidence: ["<details", "Route details"] },
  "flow-subflows": { kind: "user-facing-only", files: ["../subflows/SubflowsView.tsx"] },
  "flow-instructions": { kind: "disclosed", files: ["../instructions/InstructionWorkbenchPanels.tsx"], evidence: ["JsonToggle", "Show Instruction JSON"] },
  adaptations: { kind: "disclosed", files: ["../adaptations/AdaptationsView.tsx", "../adaptations/AdaptationChangeCard.tsx"], evidence: ["JsonToggle", "Show complete adaptation JSON", "Technical change details"] },
  "flow-settings": { kind: "disclosed", files: ["../settings/FlowSettingsView.tsx", "../settings/SubflowSettingsView.tsx"], evidence: ["JsonToggle", "<details", "Show Technical Metadata", "Technical ownership identifiers"] },
  "state-explorer": { kind: "disclosed", files: ["../state/StateRawPanel.tsx"], evidence: ["Show raw JSON", "aria-expanded"] },
  "runtime-debug": { kind: "disclosed", files: ["../runtime/FlowRunView.tsx", "../runtime/RunDetailPanels.tsx"], evidence: ["<details", "Advanced JSON", "JsonToggle", "Raw JSON"] },
  "problems-view": { kind: "user-facing-only", files: ["../problems/ProblemsView.tsx"] },
  "global-inspector": { kind: "disclosed", files: ["../inspector/InspectorSection.tsx"], evidence: ["<details", "<summary"] }
};

const intentionalTechnicalDiagnosticsAllowlist = ["development:data-flow-inspector"] as const;

describe("canonical view diagnostics disclosure", () => {
  it("assigns a diagnostics policy to every and only registered canonical view", () => {
    const registered = automationStudioViewDefinitionsList.map((definition) => definition.id).sort();
    expect(Object.keys(policies).sort()).toEqual(registered);
    expect(intentionalTechnicalDiagnosticsAllowlist).toEqual(["development:data-flow-inspector"]);
    expect(registered).not.toContain("development:data-flow-inspector");
  });

  it.each(Object.entries(policies))("enforces the %s diagnostics contract", (_viewId, policy) => {
    const source = policy.files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
    if (policy.kind === "disclosed") {
      for (const marker of policy.evidence ?? []) expect(source).toContain(marker);
      return;
    }
    expect(source).not.toMatch(/<pre[^>]*>\s*\{?JSON\.stringify/);
    expect(source).not.toMatch(/(?:Technical metadata|Raw JSON|Implementation diagnostics)/i);
  });

  it("keeps the allowlisted Data Inspector development-only", () => {
    const inspector = readFileSync(new URL("../development/DataInspector.tsx", import.meta.url), "utf8");
    const composition = readFileSync(new URL("../live/AutomationStudioWorkspaceComposition.tsx", import.meta.url), "utf8");
    expect(inspector).toContain("Live development telemetry");
    expect(composition).toContain('showDataInspector={process.env.NODE_ENV !== "production"}');
  });
});
