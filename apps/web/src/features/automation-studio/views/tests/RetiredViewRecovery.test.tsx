import React from "react";
import { GitBranch } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationRetiredViewRecovery } from "../RetiredViewRecovery";

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

    expect(html).toContain("This tab is no longer available");
    expect(html).toContain("Pick an automation");
    expect(html).toContain("open Suggested changes");
    expect(html).toContain("does not remove recordings");
    expect(html).not.toContain("Generate");
  });

  it("directs retired Config tabs to Settings without mounting Config UI", () => {
    const html = renderToStaticMarkup(
      <AutomationRetiredViewRecovery
        retiredId="config-default"
        view={{ id: "config-default", label: "Old Config", type: "config", icon: GitBranch }}
      />
    );

    expect(html).toContain("This tab is no longer available");
    expect(html).toContain("open Settings");
    expect(html).toContain("does not change any settings");
    expect(html).not.toContain("open Suggested changes");
  });
});
