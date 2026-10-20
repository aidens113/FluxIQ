// One memory of a subflow's trials and their advice across a build's briefs
// (t741 D, `../run-brief.ts`, `ADVICE`). Social rerun round 3 handed the repair
// brief the build brief's judge advice again, word for word; the builder loop
// leaves out advice it was already given only when the memory it is handed
// spans both briefs. So every brief of one subflow in one build -- a later
// dispatch's too, as a repair follows a build -- is handed the same memory, a
// brief of another subflow its own, and another build a new one.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSubflowRepeatedAdvice } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { gardenBrief, gardenBuild } from "./dispatch-fixture.ts";

type Memories = Map<string, AutomationStudioSubflowRepeatedAdvice | undefined>;

/** A recorded build of `briefs` whose builder loop keeps the memory each brief was handed, by brief id. */
async function recorded(briefs: Parameters<typeof gardenBuild>[0]["briefs"]) {
  const build = await gardenBuild({ capacity: 1, briefs });
  const inner = build.dispatcherInput.runBuilder!;
  const memories: Memories = new Map();
  build.dispatcherInput.runBuilder = async (input) => {
    memories.set(input.scope.briefId, input.repeatedAdvice);
    return inner(input);
  };
  return { build, memories };
}

describe("a subflow's advice memory across a build's briefs", () => {
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
