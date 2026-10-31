// t787: a trial's press that the domain answered as a toggle is told to the
// build's record of toggles (`ports.exploredToggles`), under the executed node
// id, so the next submission of the same step is tied to it
// (`../../../../../flow-bootstrap/script-statements/toggle-idempotent.ts`). The
// domain lifts the toggle to the top of the dispatch payload, which the runtime
// keeps as the attempt's `outputs.result`, beside `skipped`.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioExploredToggles } from "../../../../../flow-bootstrap/index.ts";
import { runAutomationStudioCandidateTrial } from "../../../index.ts";
import { trialFixture } from "../../fixtures.ts";

const SIGNATURE = { via: "name", gains: ["on"], loses: ["off"] };
const BEFORE = { via: "name", gains: ["off"], loses: ["on"] };

/** Every press answers `outputs`. */
function pressing(fixture: ReturnType<typeof trialFixture>, outputs: JsonObject): void {
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs } }) } as ReturnType<typeof fixture.ports.graphOptions>);
}

describe("a candidate trial's toggles", () => {
  it("are recorded from a press the domain answered as a toggle, under the node id the step's plan key ends", async () => {
    const fixture = trialFixture(["modify_existing"]);
    pressing(fixture, { result: { status: "succeeded", toggle: { signature: SIGNATURE, beforeSignature: BEFORE } } });
    fixture.ports.deniedEvidenceKeys = [];
    const toggles = new AutomationStudioExploredToggles();
    fixture.ports.exploredToggles = toggles;
    await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    const recorded = toggles.list();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ node: "custom.press", handles: [], signature: SIGNATURE, beforeSignature: BEFORE });
    // The executed id ends with the step's `<subflow key>.<node key>`, which is how a later revision's step is tied to it.
    expect(recorded[0]!.trialNodes).toHaveLength(1);
    expect(recorded[0]!.trialNodes![0]).toMatch(/\.primary\.press$/u);
    // With the parameters the trial's node ran with (it has none), by which a later revision's step is known (t792).
    expect(recorded[0]!.trialParameters).toEqual({});
  });

  it("record nothing from a press that answered no toggle", async () => {
    const fixture = trialFixture(["modify_existing"]);
    pressing(fixture, { result: { status: "succeeded" } });
    fixture.ports.deniedEvidenceKeys = [];
    const toggles = new AutomationStudioExploredToggles();
    fixture.ports.exploredToggles = toggles;
    await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(toggles.list()).toEqual([]);
  });
});
