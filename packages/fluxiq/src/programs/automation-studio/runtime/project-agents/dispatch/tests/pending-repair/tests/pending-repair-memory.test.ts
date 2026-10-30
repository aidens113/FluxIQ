// One repair memory of a subflow's failed whole test across a build's briefs
// (t804, `../run-brief.ts`, `REPAIRS`): a repair brief's gate refuses a whole
// test until a run from the step its build brief's test failed at passes it, so
// every brief of one subflow and plan in one build -- a later dispatch's too --
// is handed the same memory, a brief of another subflow its own, and another
// build a new one.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowPendingRepair } from "../../../../../flow-bootstrap/subflow-candidate/index.ts";
import { gardenBrief, gardenBuild } from "../../dispatch-fixture.ts";

type Memories = Map<string, AutomationStudioSubflowPendingRepair | undefined>;

/** A recorded build of `briefs` whose builder loop keeps the repair memory each brief was handed, by brief id. */
async function recorded(briefs: Parameters<typeof gardenBuild>[0]["briefs"]) {
  const build = await gardenBuild({ capacity: 1, briefs });
  const inner = build.dispatcherInput.runBuilder!;
  const memories: Memories = new Map();
  build.dispatcherInput.runBuilder = async (input) => {
    memories.set(input.scope.briefId, input.pendingRepair);
    return inner(input);
  };
  return { build, memories };
}

describe("a subflow's failed-test repair across a build's briefs (t804)", () => {
  it("is one memory for every brief of the same subflow, a later dispatch's too, and another for another subflow", async () => {
    const [seedsFirst, packet, seedsLater] = [gardenBrief("b-seeds-1", "list_seeds"), gardenBrief("b-packet", "open_packet"), gardenBrief("b-seeds-2", "list_seeds")];
    const { build, memories } = await recorded([seedsFirst!, packet!, seedsLater!]);
    await build.run([seedsFirst!, packet!]);
    await build.run([seedsLater!]);
    const first = memories.get("b-seeds-1");
    expect(first).toBeDefined();
    expect(memories.get("b-seeds-2")).toBe(first);
    expect(memories.get("b-packet")).toBeDefined();
    expect(memories.get("b-packet")).not.toBe(first);
  });

  it("is a new memory in another build", async () => {
    const one = await recorded([gardenBrief("b-seeds-1", "list_seeds")]);
    await one.build.run();
    const two = await recorded([gardenBrief("b-seeds-1", "list_seeds")]);
    await two.build.run();
    expect(one.memories.get("b-seeds-1")).toBeDefined();
    expect(two.memories.get("b-seeds-1")).not.toBe(one.memories.get("b-seeds-1"));
  });
});
