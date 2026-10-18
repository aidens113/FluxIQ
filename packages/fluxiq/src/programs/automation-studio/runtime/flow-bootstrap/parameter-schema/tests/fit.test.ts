import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { automationStudioParameterSchemaMisfits } from "../index.ts";

// Where a structured parameter does not fit the JSON Schema its node publishes
// (`../fit.ts`, lane 3 `run-mvcvzwk1-c1d869e4`). The node is a generic map
// viewer's zoom, not any action a domain registers: the check knows no action.

function zoomDefinition(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "domain.demo.zoom",
    version: "1.0.0",
    label: "Zoom",
    description: "Zooms the map.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "demo.zoom" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: "demo.zoom" },
    inputs: [],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [
      { id: "zoom", label: "Zoom", valueType: "object" },
      { id: "marker", label: "Marker", valueType: "object" },
      { id: "label", label: "Label", valueType: "string" }
    ],
    metadata: {
      parameterSchema: {
        type: "object",
        properties: {
          // A closed request: the domain owns every key.
          zoom: {
            type: "object",
            required: ["mode"],
            additionalProperties: false,
            properties: {
              mode: { type: "string", enum: ["in", "out", "fit"] },
              steps: { type: "integer" },
              layers: { type: "array", items: { type: "string" } }
            }
          },
          // An open one, as a recorded identity is: extra signals are kept.
          marker: { type: "object", properties: { title: { type: "string" } } }
        }
      }
    }
  };
}

function misfits(parameterId: string, value: JsonValue, definition = zoomDefinition()) {
  return automationStudioParameterSchemaMisfits({ definition, parameterId, value });
}

const FIELDS = ["mode", "steps", "layers"];

describe("a parameter value against the schema its node publishes", () => {
  it("fits when it matches, and an open object keeps keys its schema does not list", () => {
    expect(misfits("zoom", { mode: "in", steps: 2, layers: ["roads"] })).toEqual([]);
    expect(misfits("marker", { title: "Depot", colour: "red" })).toEqual([]);
  });

  it("has nothing to say about a parameter, or a node, with no published schema", () => {
    expect(misfits("label", 42)).toEqual([]);
    const { metadata: _dropped, ...bare } = zoomDefinition();
    expect(misfits("zoom", { until: "settled" }, bare)).toEqual([]);
  });

  it("names a missing required field and an undeclared one, with the fields the object takes", () => {
    expect(misfits("zoom", { until: "settled" })).toEqual([
      { field: "zoom.mode", valid: FIELDS, message: "The step's \"zoom\" lacks its required field \"mode\". The fields \"zoom\" takes are \"mode\", \"steps\" and \"layers\". Write it with \"mode\"." },
      { field: "zoom.until", valid: FIELDS, message: "The step's \"zoom\" takes no field \"until\". The fields \"zoom\" takes are \"mode\", \"steps\" and \"layers\". Write only those." }
    ]);
  });

  it("names the words an enum takes, never the word written", () => {
    const [misfit, ...rest] = misfits("zoom", { mode: "sideways" });

    expect(rest).toEqual([]);
    expect(misfit).toEqual({ field: "zoom.mode", valid: ["in", "out", "fit"], message: "The step's \"zoom.mode\" takes only \"in\", \"out\" or \"fit\", and the value written there is none of them." });
    expect(misfit!.message).not.toContain("sideways");
  });

  it("refuses a wrong type inside an object and inside a list, and the parameter's own type", () => {
    expect(misfits("zoom", { mode: "out", steps: 1.5, layers: ["roads", 3] }).map((misfit) => misfit.field)).toEqual(["zoom.steps", "zoom.layers.1"]);
    expect(misfits("zoom", { mode: "out", steps: 1.5 })[0]!.message).toBe("The step's \"zoom.steps\" must be an integer, and the value written there is not.");
    expect(misfits("marker", { title: 7 })).toEqual([{ field: "marker.title", message: "The step's \"marker.title\" must be a string, and the value written there is not." }]);
    expect(misfits("zoom", ["in"])).toEqual([{ field: "zoom", message: "The step's \"zoom\" must be an object, and the value written there is not." }]);
  });

  it("leaves a state binding anywhere inside the value to be resolved at run time", () => {
    expect(misfits("zoom", { mode: { $state: { path: "zoomMode" } } })).toEqual([]);
    expect(misfits("zoom", { $state: { path: "zoom" } })).toEqual([]);
  });

  it("does not quote an undeclared key that is not an identifier", () => {
    expect(misfits("zoom", { mode: "fit", "say \"hi\" there": 1 })[0]!.message)
      .toBe("The step's \"zoom\" takes no field of the name written. The fields \"zoom\" takes are \"mode\", \"steps\" and \"layers\". Write only those.");
  });

  it("stops at five misfits for one parameter", () => {
    expect(misfits("zoom", { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toHaveLength(5);
  });
});
