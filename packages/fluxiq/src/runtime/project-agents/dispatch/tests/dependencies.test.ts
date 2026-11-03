import { describe, expect, it } from "vitest";
import { automationStudioProjectDispatchDependencies } from "../index.ts";
import { gardenBrief } from "./dispatch-fixture.ts";

describe("a dispatch's dependencies", () => {
  it("waits only on briefs of the same dispatch whose subflow the entry names", () => {
    const { waitsOn, cyclic } = automationStudioProjectDispatchDependencies([
      gardenBrief("b-plant", "plant_packet", ["list_seeds", "open_packet"]),
      gardenBrief("b-read", "list_seeds"),
      gardenBrief("b-open", "open_packet", ["list_seeds"])
    ]);
    expect(waitsOn).toEqual([[1, 2], [], [1]]);
    expect([...cyclic]).toEqual([]);
  });

  it("names the briefs in a ring of waits, and not the one waiting on the ring", () => {
    const { cyclic } = automationStudioProjectDispatchDependencies([
      gardenBrief("b-read", "list_seeds", ["open_packet"]),
      gardenBrief("b-open", "open_packet", ["list_seeds"]),
      gardenBrief("b-plant", "plant_packet", ["open_packet"])
    ]);
    expect([...cyclic].sort()).toEqual([0, 1]);
  });

  it("never makes a brief wait on another brief of its own subflow", () => {
    const { waitsOn } = automationStudioProjectDispatchDependencies([gardenBrief("b-read", "list_seeds"), gardenBrief("b-read-2", "list_seeds")]);
    expect(waitsOn).toEqual([[], []]);
  });
});
