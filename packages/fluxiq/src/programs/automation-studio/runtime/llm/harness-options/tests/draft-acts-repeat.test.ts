// The acts checklist the loop shows beside the draft carries the repeat
// amendment an act needs (t195): the completion no longer refuses
// `act_needs_repeat` or `span_stops_short`, so the suggestion that went with
// the refusal (`../repeat-suggestion.ts`) is shown here instead, as information.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftActs } from "../draft-acts.ts";

const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";
const WITHDRAW = "On Guildline, withdraw every connection request I sent a month or more ago that is still waiting for an answer.";

function step(position: number, actionId: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId, input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

const shown = (instructionText: string, steps: AutomationStudioFlowDraftStep[], library = true) =>
  automationStudioFlowBootstrapDraftActs({ instructionText, ...(library ? { registry, resolution } : {}) }).acts(steps) as JsonObject[];

describe("the repeat amendment on the acts checklist", () => {
  // Run `run-muntu7in-e3dd1972`: the listing, then one Confirm named for the act.
  const once = [step(1, "web.output.browser-navigate"), step(2, "web.output.dom-extract_list"), step(3, "web.output.dom-click", { acts: ["a1"] })];

  it("shows an act that needs a repeat the amendment that repeats its step over the listing", () => {
    const [act] = shown(CONFIRM, once);

    expect(act).toMatchObject({ id: "a1", todo: "act_needs_repeat", step: 3, repeatWith: { step: 3, change: "repeat", over: 2, through: 3 } });
    expect(act?.repeatSaid).toContain("repeatWith is the amendment that makes step 3 run once for every row step 2 lists");
  });

  it("shows a span that stops short the amendment carried through the step after it", () => {
    const draft = [step(1, "web.output.dom-extract_list"), step(2, "web.output.dom-click", { acts: ["a1"], routing: { kind: "repeat", over: "d1", through: "d2" } }), step(3, "web.output.dom-click", { input: { consequences: ["delete"] } })];
    const [act] = shown(WITHDRAW, draft);

    expect(act).toMatchObject({ id: "a1", todo: "span_stops_short", step: 2, after: 3, repeatWith: { step: 2, change: "repeat", over: 1, through: 3 } });
  });

  it("shows no amendment without the node library, or once the act is done", () => {
    expect(shown(CONFIRM, once, false)[0]).not.toHaveProperty("repeatWith");
    const repeated = [once[0]!, once[1]!, step(3, "web.output.dom-click", { acts: ["a1"], routing: { kind: "repeat", over: "d2", through: "d3" } })];
    expect(shown(CONFIRM, repeated)[0]).toEqual({ id: "a1", verb: "confirm", quote: expect.any(String), plural: true, done: 3 });
  });
});
