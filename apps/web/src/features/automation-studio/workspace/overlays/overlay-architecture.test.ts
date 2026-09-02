import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellOutputPattern = new RegExp([
  ["System", "Management", "Automation"].join("\\."),
  ["Internal", "Host"].join(""),
  ["Script", "completed"].join(" "),
  ["Wall", "time"].join(" "),
  ["Command", "output"].join(" ")
].join("|"));

const overlayDirectory = new URL(".", import.meta.url);
const implementationFiles = readdirSync(overlayDirectory)
  .filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx"));

describe("Phase 9 overlay architecture", () => {
  it("contains no shell output contamination or unexpected one-line implementations", () => {
    for (const name of implementationFiles) {
      const source = readFileSync(new URL(name, overlayDirectory), "utf8");
      expect(source, name).not.toMatch(shellOutputPattern);
      expect(source.trim().split(/\r?\n/).length, name).toBeGreaterThan(5);
    }
  });

  it("keeps every implementation focused and under 300 lines", () => {
    for (const name of implementationFiles) {
      const source = readFileSync(new URL(name, overlayDirectory), "utf8");
      expect(source.split(/\r?\n/).length, name).toBeLessThan(300);
    }
  });

  it("does not recreate the root render-input array or import domain collections", () => {
    const source = implementationFiles
      .map((name) => readFileSync(new URL(name, overlayDirectory), "utf8"))
      .join("\n");
    expect(source).not.toContain("renderInputs");
    expect(source).not.toContain("workspaceOverlayRenderInputs");
    expect(source).not.toMatch(/projectFlows|projectRecordings|runtimeSessions|pipelineArtifacts|hierarchyNodes/);
  });

  it("provides focus, Escape, non-blocking scroll, and viewport containment", () => {
    const floating = readFileSync(new URL("accessible-floating-overlay.tsx", overlayDirectory), "utf8");
    const environment = readFileSync(new URL("../../../programs/overlay-environment.ts", overlayDirectory), "utf8");
    expect(floating).toContain('mode: "nonmodal"');
    expect(floating).not.toContain('aria-modal="true"');
    expect(floating).not.toContain("addEventListener(");
    expect(environment).toContain('keyboardEvent.key === "Escape"');
    expect(environment).toContain('keyboardEvent.key === "Tab"');
    expect(environment).toContain('documentRef.addEventListener("pointerdown"');
    expect(environment).toContain('documentRef.defaultView?.addEventListener("resize"');
    expect(environment).toContain('mode === "modal" || mode === "drawer"');
    expect(floating).toContain("maxHeight:");
    expect(floating).toContain("maxWidth:");
    const modalSubscribers = [
      "ProjectOverlaySubscriber.tsx",
      "HierarchyCreateOverlaySurface.tsx",
      "HierarchyDeleteOverlaySurface.tsx",
      "PreferencesOverlaySubscriber.tsx"
    ].map((name) => readFileSync(new URL(name, overlayDirectory), "utf8")).join("\n");
    expect(modalSubscribers).toContain("<Modal");
    const drawers = readFileSync(new URL("WorkspaceDrawerSubscribers.tsx", overlayDirectory), "utf8")
      + readFileSync(new URL("InspectorDrawerSubscriber.tsx", overlayDirectory), "utf8");
    expect(drawers).toContain("<Drawer");
    expect(drawers).toContain("closeOnEscape");
  });
});
