import React from "react";
import { GitBranch } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationViewBoundary } from "./AutomationViewBoundary";
import type { AutomationViewInstance } from "./view-types";

const view: AutomationViewInstance = { id: "router", label: "Router", type: "router", icon: GitBranch };
const token = { projectGeneration: 3, requestToken: 9 };

describe("Automation view-local loading boundary", () => {
  it("renders explicit loading, empty, and error surfaces", () => {
    const render = () => <div>ready content</div>;
    const loading = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "loading", token }} render={render} view={view} />);
    const empty = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "empty", token, message: "No routes." }} render={render} view={view} />);
    const error = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "error", token, error: new Error("offline") }} render={render} view={view} />);

    expect(loading).toContain('data-view-state="loading"');
    expect(loading).toContain("Loading Router");
    expect(empty).toContain('data-view-state="empty"');
    expect(empty).toContain("No routes.");
    expect(error).toContain('data-view-state="error"');
    expect(error).toContain("offline");
  });

  it("renders ready data and keeps stale ready data visible", () => {
    const render = (model: { value: string }) => <div>{model.value}</div>;
    const ready = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "ready", token, data: { value: "fresh" } }} render={render} view={view} />);
    const stale = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "stale-ready", token, data: { value: "cached" } }} render={render} view={view} />);
    const failedRefresh = renderToStaticMarkup(<AutomationViewBoundary readiness={{ status: "stale-ready", token, data: { value: "cached" }, error: new Error("offline") }} render={render} view={view} />);

    expect(ready).toContain("fresh");
    expect(stale).toContain('data-view-state="stale-ready"');
    expect(stale).toContain("Refreshing...");
    expect(stale).toContain("cached");
    expect(failedRefresh).toContain("Refresh failed. Showing the last available data.");
    expect(failedRefresh).toContain("cached");
  });
});
