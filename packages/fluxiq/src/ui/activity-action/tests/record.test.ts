import { describe, expect, it } from "vitest";
import { activityActionRecordOf } from "../record.ts";

describe("activityActionRecordOf", () => {
  it("reads the result code and the node id a tool row carries", () => {
    expect(activityActionRecordOf("Result: web.target.not_found · Node: web.output.dom-click")).toEqual({ resultCode: "web.target.not_found", node: "web.output.dom-click" });
    expect(activityActionRecordOf("Node: web.output.wait")).toEqual({ resultCode: undefined, node: "web.output.wait" });
    expect(activityActionRecordOf("Result: core.replay.replayed")).toEqual({ resultCode: "core.replay.replayed", node: undefined });
  });

  it("reads nothing from a sentence", () => {
    expect(activityActionRecordOf("The Flow never reads the list.")).toEqual({ resultCode: undefined, node: undefined });
    expect(activityActionRecordOf(undefined)).toEqual({ resultCode: undefined, node: undefined });
  });
});
