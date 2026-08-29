import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("retired review UI boundary", () => {
  it("keeps Adaptations as the only generated-change review host", () => {
    const types = source("./views/view-host-types.ts");
    const registry = source("./views/canonical-view-definitions.tsx");
    const host = source("./views/ViewHost.tsx");
    const live = source("./AutomationStudioLive.tsx");

    expect(types).not.toContain("AutomationProposalView");
    expect(types).not.toContain("AutomationProposalGeneratorView");
    expect(registry).not.toContain('id: "proposal"');
    expect(registry).not.toContain('id: "proposal-generator"');
    expect(registry).toContain('id: "adaptations"');
    expect(host).toContain("AutomationRetiredViewRecovery");
    expect(host).toContain("resolution.status === \"retired\"");
    expect(existsSync(new URL("./views/legacy-renderer-adapter.tsx", import.meta.url))).toBe(false);
    expect(host).not.toContain('view.type === "proposal-generator"');
    expect(live).not.toContain('"create-recording-flow-proposals"');
    expect(live).not.toContain('"generate-recording-proposal"');
  });

  it("deletes unsupported retired view implementations", () => {
    expect(existsSync(new URL("./views/ProposalView.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./views/ProposalGeneratorView.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./legacy/config", import.meta.url))).toBe(false);
  });
});
