// Every brief's opening call carries the build's places (`../run-brief.ts`,
// t743). Office rerun round 4 (`run-mvgvyaip-d856e135`): each fresh brief forgot
// the list pages the briefs before it stood on, and the domain refused them as
// addresses never shown. The opening call -- not its answer -- carries the
// locations of the lists whose refs the build issued, under `places`. Generic
// shelves only; the model is a script.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioProjectBuilderPorts, AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild } from "./dispatch-fixture.ts";

type Sent = { callId: string; value: JsonObject };
type Issued = Array<{ ref: string; count: number; location?: string }>;
const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const PRESS: AutomationStudioLlmEvidenceTool = { toolId: "site.press", description: "Press a control", effect: "mutate", inputSchema: { type: "object" } };
const ISSUED: Issued = [
  { ref: "destination-1", count: 4, location: "https://shelves.test/" },
  { ref: "destination-2", count: 2, location: "https://shelves.test/search?q=fern" },
  { ref: "destination-3", count: 1, location: "https://shelves.test/" },
  { ref: "destination-4", count: 3, location: "[withheld]" },
  { ref: "destination-5", count: 0 }
];

/** Builder ports whose model presses once, then ends the brief blocked; every call sent kept in `sent`. */
function builderPorts(sent: Sent[], issuedRefs?: () => Issued): () => AutomationStudioProjectBuilderPorts {
  return () => {
    let decisions = 0;
    const ports: AutomationStudioProjectBuilderPorts & { issuedRefs?: () => Issued } = {
      loop: {
        tools: [LOOK, PRESS], maxToolCalls: 6,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async (call) => {
          sent.push({ callId: call.callId, value: structuredClone(call.value) });
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The shelves." }, effectApplied: false, targetsUnchanged: true };
        },
        decide: async () => {
          decisions += 1;
          return decisions === 1 ? { kind: "tool_call", callId: "call.1", toolId: PRESS.toolId, input: { press: "next" } } : { kind: "complete", result: { ended: "blocked", reason: "Nothing to do here." } };
        }
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      ...(issuedRefs ? { issuedRefs } : {})
    };
    return ports;
  };
}

async function builderSent(issuedRefs?: () => Issued): Promise<Sent[]> {
  const sent: Sent[] = [];
  const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-build", "list_seeds")], ports: { builder: builderPorts(sent, issuedRefs) } });
  build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
  await build.run();
  return sent;
}

describe("a build brief's opening call", () => {
  it("carries the build's issued lists' locations under places, each once, none withheld, and no later call carries them", async () => {
    const sent = await builderSent(() => ISSUED);
    const opening = sent.find((entry) => entry.callId.startsWith("initial."));
    expect(opening?.value.places).toEqual(["https://shelves.test/", "https://shelves.test/search?q=fern"]);
    const later = sent.filter((entry) => !entry.callId.startsWith("initial."));
    expect(later.length).toBeGreaterThan(0);
    for (const entry of later) expect(entry.value).not.toHaveProperty("places");
  });

  it("reads the refs as the opening call is made, so an earlier brief's are in", async () => {
    const issued: Issued = [];
    const sent: Sent[] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-build", "list_seeds")], ports: { builder: builderPorts(sent, () => issued) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    issued.push({ ref: "destination-1", count: 2, location: "https://shelves.test/cart" });
    await build.run();
    expect(sent.find((entry) => entry.callId.startsWith("initial."))?.value.places).toEqual(["https://shelves.test/cart"]);
  });

  it("carries no key when the build issued no located list, or its ports give no refs", async () => {
    for (const issuedRefs of [() => [] as Issued, () => [{ ref: "destination-1", count: 1, location: "[withheld]" }], undefined]) {
      const sent = await builderSent(issuedRefs);
      const opening = sent.find((entry) => entry.callId.startsWith("initial."));
      expect(opening).toBeDefined();
      expect(opening?.value).not.toHaveProperty("places");
    }
  });
});

describe("a reset brief's opening call", () => {
  it("carries the build's places too, and keeps the refs for its refusal", async () => {
    const sent: Sent[] = [];
    const ports: AutomationStudioProjectResetPorts & { issuedRefs: () => Issued } = {
      loop: {
        tools: [LOOK, { toolId: "site.undo", description: "Undo one act", effect: "mutate", inputSchema: { type: "object" } }],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async (call) => {
          sent.push({ callId: call.callId, value: structuredClone(call.value) });
          return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true };
        },
        decide: async () => ({ kind: "complete", result: { summary: "done" } })
      },
      remainingActs: async () => [],
      issuedRefs: () => ISSUED
    };
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset: () => ports } });
    await build.run();
    const opening = sent.find((entry) => entry.callId.startsWith("initial."));
    expect(opening?.value.places).toEqual(["https://shelves.test/", "https://shelves.test/search?q=fern"]);
  });
});
