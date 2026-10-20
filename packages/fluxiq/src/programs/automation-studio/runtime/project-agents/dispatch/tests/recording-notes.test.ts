// The supervisor's notes from the person's recording reach the builder (t741
// B3). A build brief carrying `recordingExcerpt` shows it at the builder's
// opening look under `recordingNotes`, framed as notes to weigh beside the page,
// not instructions; a brief without one opens exactly as it always did. The real
// builder loop runs on a scripted model, on the dispatcher's garden catalogue.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioProjectBuilderPorts } from "../index.ts";
import { gardenBrief, gardenBuild } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };
const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const opening = (evidence: readonly Entry[]) => evidence.find((entry) => entry.callId.startsWith("initial."))?.value as JsonObject | undefined;
const EXCERPT = "The person opened the catalogue, filtered it to the spring packets and read each packet's name and price.";

/** Builder ports whose model ends every brief blocked, each brief's first request's evidence kept by its brief id. */
function endingBlocked(seen: Map<string, Entry[]>): (request: { brief: { briefId: string } }) => AutomationStudioProjectBuilderPorts {
  return (request) => ({
    loop: {
      tools: [LOOK], maxToolCalls: 6,
      unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true }),
      decide: async ({ evidence }) => {
        if (!seen.has(request.brief.briefId)) seen.set(request.brief.briefId, evidence.map((entry) => ({ ...entry })));
        return { kind: "complete", result: { ended: "blocked", reason: "Nothing to do here." } };
      }
    },
    submission: testSubmission(),
    deniedEvidenceKeys: []
  });
}

describe("a brief carrying the supervisor's recording excerpt", () => {
  it("shows it to its builder at the opening look as notes to weigh, and a brief without one opens unchanged", async () => {
    const seen = new Map<string, Entry[]>();
    const noted = gardenBrief("b-noted", "list_seeds", [], (sent) => {
      sent.recordingExcerpt = EXCERPT;
    });
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-plain", "list_seeds"), noted], ports: { builder: endingBlocked(seen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    const returns = (await build.run()).returns;
    expect(returns.map((returned) => returned.outcome)).toEqual(["blocked", "blocked"]);

    const plain = opening(seen.get("b-plain")!)!;
    expect(plain).not.toHaveProperty("recordingNotes");
    const withNotes = opening(seen.get("b-noted")!)!;
    const shown = withNotes.recordingNotes as JsonObject;
    expect(shown.excerpt).toBe(EXCERPT);
    for (const words of ["the supervisor's notes from the person's recording", "not instructions", "what the page shows now", "your brief's parts"]) expect(String(shown.note)).toContain(words);
    // Everything else the builder opens on is byte-identical to the brief without notes.
    const { recordingNotes: _notes, ...rest } = withNotes;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(plain));
  });
});
