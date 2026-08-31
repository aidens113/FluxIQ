import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  automationStudioViewDefinition,
  automationStudioViewIds,
  type AutomationStudioViewId
} from "../../views/view-registry";
import type { AutomationViewHostBindingMap } from "../../views/view-host-types";
import type { RouterViewHostCommands } from "../../router/router-host";
import {
  createAutomationCanonicalViewEntry,
  createAutomationViewHostComposition,
  type AutomationCanonicalViewHostInput,
  type AutomationCanonicalViewHostInputs,
  type AutomationViewCompositionActivity
} from ".";

describe("typed Automation Studio view-host composition", () => {
  it("creates one isolated typed source entry without a universal renderer contract", () => {
    const entry = createAutomationCanonicalViewEntry(
      "flow-router",
      input("flow-router", "warm", { flow: "selected" })
    );
    expect(entry.view.id).toBe("flow-router");
    expect(entry.request.kind).toBe("router");
    expect("binding" in entry.request ? entry.request.binding.model : null).toEqual({ flow: "selected" });
  });
  it("publishes every canonical view with its registered kind", async () => {
    const composition = createAutomationViewHostComposition();
    const views = allCanonicalInputs();

    const result = await composition.publish({
      projectKey: "project-a",
      views,
      requestedViewIds: automationStudioViewIds
    });

    expect(result.cancelled).toBe(false);
    expect(result.published).toBe(automationStudioViewIds.length);
    for (const viewId of automationStudioViewIds) {
      const entry = composition.source.get(viewId);
      expect(entry, viewId).not.toBeNull();
      expect(entry?.request.kind, viewId).toBe(automationStudioViewDefinition(viewId)?.kind);
      expect(entry?.request.view.id, viewId).toBe(viewId);
      expect(entry?.request.view.type, viewId).toBe(automationStudioViewDefinition(viewId)?.kind);
    }
  });

  it("resets project-owned entries and cancels stale batched publication", async () => {
    const scheduled: Array<() => void> = [];
    const composition = createAutomationViewHostComposition({
      batchSize: 1,
      schedule: (task) => scheduled.push(task)
    });
    const firstViews = allCanonicalInputs();
    firstViews["client-gateway"] = input("client-gateway", "active", { project: "a" });
    const first = composition.publish({
      projectKey: "project-a",
      views: firstViews,
      requestedViewIds: automationStudioViewIds
    });

    const secondViews = allCanonicalInputs();
    secondViews["client-gateway"] = input("client-gateway", "active", { project: "b" });
    const second = composition.publish({
      projectKey: "project-b",
      views: secondViews,
      requestedViewIds: ["client-gateway"]
    });

    flushScheduled(scheduled);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.cancelled).toBe(true);
    expect(secondResult.projectChanged).toBe(true);
    expect(composition.getProjectKey()).toBe("project-b");
    expect(composition.source.get("flow-nodes")).toBeNull();
    expect(
      (() => {
        const request = composition.source.get("client-gateway")?.request;
        return request && "binding" in request ? request.binding.model : null;
      })()
    ).toEqual({ project: "b" });
  });

  it("removes stale and unavailable entries without touching unrelated source entries", async () => {
    const composition = createAutomationViewHostComposition();
    const views = allCanonicalInputs();
    await composition.publish({
      projectKey: "project-a",
      views,
      requestedViewIds: ["client-gateway", "policy-primary"]
    });
    const external = composition.source.get("client-gateway")!;
    composition.source.replace("external-owner", external);

    await composition.publish({
      projectKey: "project-a",
      views: {
        "client-gateway": views["client-gateway"]!,
        "flow-nodes": input("flow-nodes", "unavailable")
      },
      requestedViewIds: ["client-gateway", "policy-primary"]
    });

    expect(composition.source.get("client-gateway")).not.toBeNull();
    expect(composition.source.get("flow-nodes")).toBeNull();
    expect(composition.source.get("external-owner")).toBe(external);
  });

  it("preserves entry identity when only activity changes", async () => {
    const model = { stable: "model" };
    const commands = { stable: () => undefined };
    const composition = createAutomationViewHostComposition();
    await composition.publish({
      projectKey: "project-a",
      views: {
        "flow-router": input("flow-router", "active", model, commands)
      }
    });
    const first = composition.source.get("flow-router");
    const firstRevision = composition.source.getRevision("flow-router");

    const result = await composition.publish({
      projectKey: "project-a",
      views: {
        "flow-router": input("flow-router", "warm", model, commands)
      }
    });

    expect(result.reused).toBe(1);
    expect(result.published).toBe(0);
    expect(composition.source.get("flow-router")).toBe(first);
    expect(composition.source.getRevision("flow-router")).toBe(firstRevision);
  });

  it("notifies only the changed view and preserves unrelated entry identity", async () => {
    const composition = createAutomationViewHostComposition();
    const views = allCanonicalInputs();
    await composition.publish({ projectKey: "project-a", views });
    const routerEntry = composition.source.get("flow-router");
    const settingsEntry = composition.source.get("flow-settings");
    const notifications = { router: 0, settings: 0 };
    const unsubscribeRouter = composition.source.subscribe("flow-router", () => {
      notifications.router += 1;
    });
    const unsubscribeSettings = composition.source.subscribe("flow-settings", () => {
      notifications.settings += 1;
    });

    const result = await composition.publish({
      projectKey: "project-a",
      views: {
        ...views,
        "flow-router": input("flow-router", "warm", { changed: true })
      }
    });

    expect(result.published).toBe(1);
    expect(result.reused).toBe(automationStudioViewIds.length - 1);
    expect(composition.source.get("flow-router")).not.toBe(routerEntry);
    expect(composition.source.get("flow-settings")).toBe(settingsEntry);
    expect(notifications).toEqual({ router: 1, settings: 0 });
    unsubscribeRouter();
    unsubscribeSettings();
  });

  it("publishes active work synchronously and bounds later batches", async () => {
    const scheduled: Array<() => void> = [];
    const composition = createAutomationViewHostComposition({
      batchSize: 2,
      schedule: (task) => scheduled.push(task)
    });
    const views = allCanonicalInputs("inactive");
    views["global-inspector"] = input("global-inspector", "active");

    const publication = composition.publish({
      projectKey: "project-a",
      views,
      requestedViewIds: automationStudioViewIds
    });

    expect(composition.source.get("global-inspector")).not.toBeNull();
    expect(scheduled).toHaveLength(1);
    expect(
      automationStudioViewIds.filter((viewId) => composition.source.get(viewId)).length
    ).toBe(2);

    flushScheduled(scheduled);
    const result = await publication;
    expect(result.published).toBe(automationStudioViewIds.length);
  });

  it("reports aliases, retired IDs, unknown IDs, and bounded overflow", async () => {
    const composition = createAutomationViewHostComposition({ maxRequestedViews: 4 });
    const result = await composition.publish({
      projectKey: "project-a",
      views: {
        "state-explorer": input("state-explorer", "active"),
        adaptations: input("adaptations", "warm")
      },
      requestedViewIds: [
        "signals-web",
        "proposal-workbench",
        "future-view",
        "state-explorer",
        "ignored-overflow"
      ]
    });

    expect(result.recoveries).toEqual([
      { status: "migrated", requestedId: "signals-web", canonicalId: "state-explorer" },
      { status: "retired", requestedId: "proposal-workbench", replacementId: "adaptations" },
      { status: "unknown", requestedId: "future-view" }
    ]);
    expect(result.ignoredRequestedViews).toBe(1);
    expect(composition.source.get("signals-web")?.request.kind).toBe("state");
    expect(composition.source.get("proposal-workbench")).toBeNull();
    expect(composition.source.get("future-view")).toBeNull();
  });

  it("keeps commands domain-specific and production composition browser-neutral", () => {

    expectTypeOf<AutomationCanonicalViewHostInput<"flow-router">["commands"]>()
      .toEqualTypeOf<AutomationViewHostBindingMap["router"]["commands"]>();
    expectTypeOf<AutomationCanonicalViewHostInput<"runtime-debug">["commands"]>()
      .toEqualTypeOf<AutomationViewHostBindingMap["runtime"]["commands"]>();

    const source = [
      readFileSync(new URL("./contracts.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./composition.ts", import.meta.url), "utf8")
    ].join(String.fromCharCode(10));

    expect(source).not.toMatch(/LegacyAutomationViewRenderer|useProgramApi|program-api/);
    expect(source).not.toMatch(/router-host|runtime-host|settings-host|subflow-host|instruction-host|adaptation-host/);
    expect(source).not.toMatch(/window|document|localStorage|sessionStorage/);
    expect(source).not.toContain('"config"');
    expect(source).not.toContain('"proposal"');
    expect(source).not.toContain('"proposal-generator"');
    expect(source).not.toContain("universalCommands");
    expect(source).not.toContain("AutomationViewRendererProps");
  });
});

function allCanonicalInputs(
  activity: AutomationViewCompositionActivity = "warm"
): AutomationCanonicalViewHostInputs {
  return Object.fromEntries(
    automationStudioViewIds.map((viewId) => [viewId, input(viewId, activity)])
  ) as AutomationCanonicalViewHostInputs;
}

function input<Id extends AutomationStudioViewId>(
  _viewId: Id,
  activity: AutomationViewCompositionActivity,
  model: object = {},
  commands: object = {}
): AutomationCanonicalViewHostInput<Id> {
  return { model, commands, activity } as AutomationCanonicalViewHostInput<Id>;
}

function flushScheduled(scheduled: Array<() => void>) {
  while (scheduled.length) scheduled.shift()?.();
}
