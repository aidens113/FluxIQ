import { describe, expect, it } from "vitest";
import { automationNodeStateBinding, resolveAutomationNodeParameterValues } from "./parameter-bindings.ts";

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
});
