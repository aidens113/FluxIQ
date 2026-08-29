import React from "react";
import { GitBranch } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationRetiredViewRecovery } from "./RetiredViewRecovery";

describe("retired Automation Studio view recovery", () => {
  it("explains deterministic recovery without reviving the old workflow", () => {
    const html = renderToStaticMarkup(
      <AutomationRetiredViewRecovery
        retiredId="proposal-workbench"
        view={{
          id: "proposal-workbench",
          label: "Old review",
          type: "proposal",
          icon: GitBranch
        }}
      />
    );

    expect(html).toContain("Saved view unavailable");
    expect(html).toContain("Select a Flow");
    expect(html).toContain("open Adaptations");
    expect(html).toContain("does not remove recordings");
    expect(html).not.toContain("Generate");
  });

  it("directs retired Config tabs to Flow Settings without mounting Config UI", () => {
    const html = renderToStaticMarkup(
      <AutomationRetiredViewRecovery
        retiredId="config-default"
        view={{ id: "config-default", label: "Old Config", type: "config", icon: GitBranch }}
      />
    );

    expect(html).toContain("Saved view unavailable");
    expect(html).toContain("open Flow Settings");
    expect(html).toContain("does not remove Flow settings");
    expect(html).not.toContain("open Adaptations");
  });
});
