// t787: a Flow run a second time over items already in the asked state presses
// nothing. The site is modelled as controls that switch between two states, and
// each step carries the asked state the way a step with `ensureState` does: the
// domain presses only a control not already so, and otherwise answers
// `skipped: "already_in_state"`. The first run switches every control on; the
// second leaves them on instead of switching them back.

import { describe, expect, it } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { framedRun } from "../../lifecycle-run/tests/recovery-paths-fixtures.ts";
import { line, page, pageOptions, press } from "../../lifecycle-run/tests/wiring-fixtures.ts";

const IDS = ["one", "two", "three"];
const steps = () => IDS.map((id) => press(id, id, { declaredConsequences: ["modify_existing"] }));

/** Options whose dispatcher flips a control only when it is off, as `ensureState` asks, counting each press. */
function toggling(site: Map<string, boolean>, presses: string[]): AutomationStudioGraphExecutionOptions {
  const options = pageOptions(page());
  options.effectDispatcher = async (effect) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
    if (site.get(id)) return { status: "success", route: "success", outputs: { skipped: "already_in_state" } };
    presses.push(id);
    site.set(id, true);
    return { status: "success", route: "success", outputs: { ok: true } };
  };
  return options;
}

describe("a second run over items already in the asked state", () => {
  it("presses nothing, and every step reads succeeded and skipped as already in state", async () => {
    const site = new Map<string, boolean>();
    const firstPresses: string[] = [];
    const first = await framedRun(line("graph.main", steps()), toggling(site, firstPresses));
    expect(first.trace.status).toBe("succeeded");
    expect(firstPresses).toEqual(IDS);

    const secondPresses: string[] = [];
    const second = await framedRun(line("graph.main", steps()), toggling(site, secondPresses));
    expect(second.trace.status).toBe("succeeded");
    expect(secondPresses).toEqual([]);
    expect([...site.values()]).toEqual([true, true, true]);
    expect(second.trace.attempts.filter((attempt) => IDS.includes(attempt.nodeId)).map((attempt) => attempt.skipped?.reason)).toEqual(["already_in_state", "already_in_state", "already_in_state"]);
    expect([...second.invocation.run.lifecycle.completedActs.values()]).toEqual([]);
  });
});
