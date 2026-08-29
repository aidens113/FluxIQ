import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ownedRoots = ["recordings", "inspector", "clients", "shared"];

function productionFiles(root: string): string[] {
  const absolute = join(featureRoot, root);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return productionFiles(relative(featureRoot, path).replaceAll("\\", "/"));
    return /\.(?:ts|tsx)$/u.test(name) && !/\.test\.(?:ts|tsx)$/u.test(name) ? [path] : [];
  });
}

describe("Phase 10F ownership architecture", () => {
  it("keeps every owned production module within the local source budget", () => {
    const oversized = ownedRoots.flatMap(productionFiles)
      .map((path) => ({ path: relative(featureRoot, path), lines: readFileSync(path, "utf8").split(/\r?\n/u).length }))
      .filter((entry) => entry.lines > 300);
    expect(oversized).toEqual([]);
  });

  it("keeps shared modules free of Automation Studio domain data dependencies", () => {
    const imports = productionFiles("shared").flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1])
    );
    expect(imports.filter((specifier) => specifier?.startsWith("../") && !specifier.includes("/programs/"))).toEqual([]);
  });

  it("isolates transports and legacy compatibility from canonical views", () => {
    const recordingView = readFileSync(join(featureRoot, "recordings/RecordingTimelineView.tsx"), "utf8");
    const recordingList = readFileSync(join(featureRoot, "recordings/useRecordingListController.ts"), "utf8");
    const recordingActions = readFileSync(join(featureRoot, "recordings/useRecordingActionController.ts"), "utf8");
    const clientController = readFileSync(join(featureRoot, "clients/useClientGatewayController.ts"), "utf8");

    expect(recordingView).not.toContain("/program-api");
    expect(recordingList).not.toContain("useProgramApi");
    expect(recordingActions).not.toContain("useProgramApi");
    expect(clientController).not.toContain("useProgramApi");
    expect(clientController).not.toContain("subscribeMountedViewActivation");
    expect(existsSync(join(featureRoot, "legacy/config"))).toBe(false);
    const hostTypes = readFileSync(join(featureRoot, "views/view-host-types.ts"), "utf8");
    const hostRegistry = readFileSync(join(featureRoot, "views/view-host-registry.tsx"), "utf8");
    expect(hostTypes).not.toContain("AutomationConfigView");
    expect(hostTypes).not.toContain("config:");
    expect(hostRegistry).not.toContain("AutomationConfigView");
    expect(hostRegistry).not.toContain('registerView("config"');
  });

  it("keeps the canonical Inspector registry scoped with no broad adapter", () => {
    const registry = readFileSync(join(featureRoot, "inspector/panel-registry.tsx"), "utf8");
    const scoped = readFileSync(join(featureRoot, "inspector/scoped-selection.ts"), "utf8");
    const canonical = readFileSync(join(featureRoot, "inspector/InspectorView.tsx"), "utf8");
    expect(registry).toContain("InspectorPanelRegistry");
    expect(registry).not.toContain("LegacyInspectorPanelContext");
    expect(scoped).not.toContain("recordings:");
    expect(scoped).not.toContain("runtimeSessions:");
    expect(canonical).toContain("InspectorPanelContext | null");
    expect(existsSync(join(featureRoot, "views/InspectorView.tsx"))).toBe(false);
    expect(existsSync(join(featureRoot, "inspector/legacy-inspector-context.ts"))).toBe(false);
  });

  it("uses only public sibling-domain entry points", () => {
    const privateImports = ownedRoots.flatMap(productionFiles).flatMap((path) => {
      const owner = relative(featureRoot, path).replaceAll("\\", "/");
      return [...readFileSync(path, "utf8").matchAll(/from\s+["'](\.\.\/(?:\.\.\/)?(?:recordings|inspector|clients|state|project|workspace|flow-editor|router|runtime|settings|instructions|adaptations|subflows)\/[^"']+)["']/gu)]
        .map((match) => owner + " -> " + match[1]);
    });
    expect(privateImports).toEqual([]);
  });
});