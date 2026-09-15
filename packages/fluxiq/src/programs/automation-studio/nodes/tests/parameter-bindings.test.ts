import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import { automationNodeStateBinding, resolveAutomationNodeParameterValues } from "../parameter-bindings.ts";

describe("Automation Studio node parameter state bindings", () => {
  it("resolves flat, nested, and snapshot state paths", () => {
    const resolved = resolveAutomationNodeParameterValues({
      flat: automationNodeStateBinding("score"),
      nested: automationNodeStateBinding("session.player.name"),
      snapshot: automationNodeStateBinding("app.inventory.count")
    }, {
      score: 7,
      session: { player: { name: "Ada" } },
      state: {
        timestamp: 1,
        namespaces: {
          app: { schemaId: "app", schemaVersion: "1", values: { "inventory.count": { type: "integer", value: 12, observedAt: 1 } } }
        }
      }
    });

    expect(resolved).toEqual({ values: { flat: 7, nested: "Ada", snapshot: 12 }, missingPaths: [] });
  });

  it("uses a retained manual fallback and reports a missing path without one", () => {
    expect(resolveAutomationNodeParameterValues({
      available: automationNodeStateBinding("missing", "manual"),
      unavailable: automationNodeStateBinding("also.missing")
    }, {})).toEqual({ values: { available: "manual" }, missingPaths: ["also.missing"] });
  });

  it("resolves a binding nested inside an object parameter", () => {
    expect(resolveAutomationNodeParameterValues({
      outputId: "web.dom.type",
      parameters: { selector: "#password", text: automationNodeStateBinding("web.secret.password") }
    }, { "web.secret.password": "supplied-sentinel" })).toEqual({
      values: { outputId: "web.dom.type", parameters: { selector: "#password", text: "supplied-sentinel" } },
      missingPaths: []
    });
  });

  it("fails a nested binding closed, naming the path and leaving no value behind", () => {
    const resolved = resolveAutomationNodeParameterValues({
      outputId: "web.dom.type",
      parameters: { selector: "#password", text: automationNodeStateBinding("web.secret.password") }
    }, {});

    expect(resolved.missingPaths).toEqual(["web.secret.password"]);
    expect(resolved.values).toEqual({ outputId: "web.dom.type", parameters: { selector: "#password" } });
    expect("text" in (resolved.values.parameters as Record<string, JsonValue>)).toBe(false);
  });

  it("uses a nested fallback and keeps descending past a resolved sibling", () => {
    expect(resolveAutomationNodeParameterValues({
      parameters: {
        text: automationNodeStateBinding("web.secret.password", "manual"),
        options: { delayMs: automationNodeStateBinding("run.delayMs") }
      }
    }, { run: { delayMs: 40 } })).toEqual({
      values: { parameters: { text: "manual", options: { delayMs: 40 } } },
      missingPaths: []
    });
  });

  it("resolves bindings inside arrays without moving the elements around them", () => {
    const resolved = resolveAutomationNodeParameterValues({
      cases: [automationNodeStateBinding("run.first"), "literal", automationNodeStateBinding("run.absent"), { value: automationNodeStateBinding("run.second") }]
    }, { run: { first: 1, second: 2 } });

    expect(resolved.missingPaths).toEqual(["run.absent"]);
    expect(resolved.values.cases).toEqual([1, "literal", { $state: { path: "run.absent" } }, { value: 2 }]);
  });

  it("does not re-resolve a value that state itself supplied in binding shape", () => {
    expect(resolveAutomationNodeParameterValues({
      parameters: { text: automationNodeStateBinding("run.payload") }
    }, { run: { payload: { $state: { path: "run.secret" } } }, "run.secret": "must-not-be-reached" })).toEqual({
      values: { parameters: { text: { $state: { path: "run.secret" } } } },
      missingPaths: []
    });
  });

  it("returns the original nested value when nothing under it resolved", () => {
    const parameters = { selector: "#password", options: { delayMs: 40 } };
    const resolved = resolveAutomationNodeParameterValues({ parameters }, {});

    expect(resolved.values.parameters).toBe(parameters);
    expect(resolved.missingPaths).toEqual([]);
  });

  it("terminates on a cyclic parameter value instead of recursing forever", () => {
    const cyclic: Record<string, unknown> = { text: automationNodeStateBinding("run.value") };
    cyclic.self = cyclic;

    const resolved = resolveAutomationNodeParameterValues({ parameters: cyclic as unknown as JsonValue }, { run: { value: "supplied" } });

    expect((resolved.values.parameters as Record<string, JsonValue>).text).toBe("supplied");
    expect(resolved.missingPaths).toEqual([]);
  });

  it("reaches a recorded node's output under its dotted id", () => {
    expect(resolveAutomationNodeParameterValues({
      text: automationNodeStateBinding("recorded.candidate.x.result.extracted")
    }, { "recorded.candidate.x.result": { extracted: "synthetic-extracted" } })).toEqual({ values: { text: "synthetic-extracted" }, missingPaths: [] });
  });

  it("starts at the longest own key a path begins with, and at a shorter one only when the rest is not under the longer", () => {
    const state: Record<string, JsonValue> = {
      "recorded.candidate.x.result": { extracted: "synthetic-longest" },
      "recorded.candidate": { x: { result: { extracted: "synthetic-shorter" } } },
      recorded: { candidate: { x: { result: { extracted: "synthetic-first-segment" } } } },
      "a.b": { c: 1 },
      a: { b: { d: 2 } }
    };

    expect(resolveAutomationNodeParameterValues({
      longest: automationNodeStateBinding("recorded.candidate.x.result.extracted"),
      underLonger: automationNodeStateBinding("a.b.c"),
      underShorter: automationNodeStateBinding("a.b.d")
    }, state)).toEqual({ values: { longest: "synthetic-longest", underLonger: 1, underShorter: 2 }, missingPaths: [] });
  });

  it("keeps an exact dotted key, a plain walk, and a state snapshot path as they were", () => {
    expect(resolveAutomationNodeParameterValues({
      exact: automationNodeStateBinding("app.inventory.count"),
      walked: automationNodeStateBinding("session.player.name"),
      missing: automationNodeStateBinding("session.player.age")
    }, {
      "app.inventory.count": "synthetic-exact",
      app: { inventory: { count: "synthetic-walked" } },
      session: { player: { name: "Ada" } }
    })).toEqual({ values: { exact: "synthetic-exact", walked: "Ada" }, missingPaths: ["session.player.age"] });

    expect(resolveAutomationNodeParameterValues({ snapshot: automationNodeStateBinding("app.inventory.count") }, {
      state: { timestamp: 1, namespaces: { app: { schemaId: "app", schemaVersion: "1", values: { "inventory.count": { type: "integer", value: 12, observedAt: 1 } } } } }
    })).toEqual({ values: { snapshot: 12 }, missingPaths: [] });
  });

  it("stops descending at the depth bound and leaves a deeper binding untouched", () => {
    let deep: JsonValue = automationNodeStateBinding("run.value");
    for (let level = 0; level < 20; level += 1) deep = { down: deep };

    const resolved = resolveAutomationNodeParameterValues({ parameters: deep }, { run: { value: "supplied" } });

    expect(resolved.missingPaths).toEqual([]);
    expect(JSON.stringify(resolved.values)).toContain("\"$state\"");
  });
});
