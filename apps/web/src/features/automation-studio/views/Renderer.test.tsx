import React from "react";
import { GitBranch } from "lucide-react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AutomationViewHost,
  createAutomationViewHostRequest,
  type AutomationViewHostRequest
} from "./Renderer";
import { automationRegisteredViewHost, automationViewHostRegistration } from "./view-host-registry";
import type { AutomationViewHostKind } from "./view-host-types";

const activity = { current: false };

describe("Automation Studio typed view host", () => {
  it("keeps Renderer as a tiny typed public surface with no compatibility adapter", () => {
    const renderer = readFileSync(new URL("./Renderer.tsx", import.meta.url), "utf8");
    expect(renderer.split(String.fromCharCode(10)).length).toBeLessThanOrEqual(30);
    expect(renderer).not.toContain("AutomationViewRenderer");
    expect(renderer).not.toContain("LegacyAutomationViewRendererAdapter");
    expect(existsSync(new URL("./legacy-renderer-adapter.tsx", import.meta.url))).toBe(false);
  });

  it("registers a typed model selector and component loader for every host kind", () => {
    const kinds: AutomationViewHostKind[] = [
      "adaptations",
      "clients",
      "design",
      "inspector",
      "instructions",
      "problems",
      "recordings",
      "router",
      "routine",
      "runtime",
      "settings",
      "state",
      "subflows"
    ];
    expect(automationRegisteredViewHost("runs-history")?.definition.id).toBe("runtime-debug");
    expect(automationRegisteredViewHost("missing-view")).toBeNull();
    for (const kind of kinds) {
      const registration = automationViewHostRegistration(kind);
      expect(registration?.kind).toBe(kind);
      expect(registration?.createDataSelector()).toBeTypeOf("function");
      expect(registration?.loadComponent()).toBeTypeOf("function");
    }
  });

  it("sleeps cold views and preserves a warm mounted compatibility surface", () => {
    const request = createAutomationViewHostRequest(
      { id: "routine", label: "Legacy Routine", type: "routine", icon: GitBranch },
      { model: {}, commands: {} }
    );
    const sleeping = renderToStaticMarkup(
      <AutomationViewHost active={false} activeRef={activity} request={request} />
    );
    const warm = renderToStaticMarkup(
      <AutomationViewHost active={false} activeRef={activity} keepMounted request={request} />
    );

    expect(sleeping).toContain("Opening Legacy Routine");
    expect(warm).toContain("Legacy Routine is read-only");
    expect(warm).not.toContain("Opening Legacy Routine");
  });

  it("shows explicit recovery for unknown and mismatched saved views", () => {
    const unknown = {
      kind: "missing",
      view: { id: "missing-view", label: "Missing", type: "missing", icon: GitBranch },
      binding: { model: {}, commands: {} }
    } as unknown as AutomationViewHostRequest;
    const mismatch = {
      kind: "state",
      view: { id: "flow-nodes", label: "Wrong type", type: "state", icon: GitBranch },
      binding: { model: {}, commands: {} }
    } as unknown as AutomationViewHostRequest;
    const retired = {
      kind: "state",
      view: { id: "proposal-workbench", label: "Old review", type: "state", icon: GitBranch },
      binding: { model: {}, commands: {} }
    } as unknown as AutomationViewHostRequest;
    const retiredConfig = {
      kind: "state",
      view: { id: "config", label: "Old Config", type: "config", icon: GitBranch },
      binding: { model: {}, commands: {} }
    } as unknown as AutomationViewHostRequest;

    const unknownHtml = renderToStaticMarkup(
      <AutomationViewHost active activeRef={{ current: true }} request={unknown} />
    );
    const mismatchHtml = renderToStaticMarkup(
      <AutomationViewHost active activeRef={{ current: true }} request={mismatch} />
    );
    const retiredHtml = renderToStaticMarkup(
      <AutomationViewHost active activeRef={{ current: true }} request={retired} />
    );
    const retiredConfigHtml = renderToStaticMarkup(
      <AutomationViewHost active activeRef={{ current: true }} request={retiredConfig} />
    );

    expect(unknownHtml).toContain("View unavailable");
    expect(unknownHtml).toContain("no longer registered");
    expect(mismatchHtml).toContain("no longer matches its registered view type");
    expect(unknownHtml).not.toContain("State View");
    expect(retiredHtml).toContain("Saved view unavailable");
    expect(retiredHtml).toContain("open Adaptations");
    expect(retiredHtml).not.toContain("State View");
    expect(retiredConfigHtml).toContain("Saved view unavailable");
    expect(retiredConfigHtml).toContain("open Flow Settings");
    expect(retiredConfigHtml).not.toContain("automation-config-view");
  });
});
