// A builder's return in a person's words (`../return-words.ts`, t649): the dispatcher writes it for
// the supervisor, and the card read its codes, calls, keys and brief ids (A8 frozen pair 3,
// `run-mv9zn5ob-d929084d`, screenshot 00008).
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brief, builderReturn, structurePlan, taskSpec } from "../../../project-agents/tests/fixtures.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { boundedAutomationStudioProjectCard } from "../../project-card-bounds.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioProjectBriefCard, emitAutomationStudioProjectReturnCard } from "../index.ts";
import { automationStudioProjectReturnWords } from "../return-words.ts";

/** Anything a person never reads: a dotted id, a key or code with underscores, a brief's id, Core's own build stage. */
const INTERNAL = /\b[a-z][\w-]+(?:\.[\w-]{2,})+\b|\b[a-z]+_[a-z_]+\b|\bbrief-\d+\b|Flow Bootstrap/iu;
const NAMES: Readonly<Record<string, string>> = { pick_branch: "Pick the branch", add_item: "Add the item" };
const nameOf = (key: string): string => NAMES[key] ?? key;
const STOPPED = "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress). It was stopped by llm_evidence_loop.repeat_refused. "
  + "The calls it stopped on, latest first: core.submit_subflow answered llm_evidence_loop.repeat_refused (failed) (3 in a row); core.run_node on web.output.dom-extract answered web.inspect.succeeded.";
const said = (outcome: "done" | "partial" | "blocked", reason: string): string => {
  const words = automationStudioProjectReturnWords({ outcome, reason }, nameOf);
  expect(words).not.toMatch(INTERNAL);
  return words;
};

describe("a builder's return, in a person's words", () => {
  it("a builder its loop stopped says why from its failure's code, and none of the calls", () => {
    expect(said("blocked", STOPPED)).toBe("The builder couldn't finish: it kept trying without getting any further, so it was stopped.");
    expect(said("blocked", "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.something_new).")).toBe("The builder couldn't finish: it stopped before this part was built.");
  });

  it("a part that waited on one that did not pass names that part, never a brief's id or a key", () => {
    expect(said("blocked", `Brief brief-1 for subflow pick_branch, which this subflow starts after, ended blocked (${STOPPED}), so this subflow's entry cannot be prepared and its trials could not run.`))
      .toBe("It starts after Pick the branch, which couldn't be built, so it was never started.");
    expect(said("blocked", "Brief brief-4 for subflow pick_branch, which this subflow starts after, ended partial with no proposal of its subflow (x), so ...")).toBe("It starts after Pick the branch, which was only partly built, so it was never started.");
    expect(said("blocked", "Subflow other_part, which this subflow starts after, is not in this dispatch and has no proposal whose trial answered yes: no brief of it has returned in this build."))
      .toBe("It starts after “other part”, which hasn't passed its test yet, so it was never started.");
    expect(said("blocked", "The build was stopped before this brief's turn came.")).toBe("The build was stopped before its turn came.");
  });

  it("the builder's own ending keeps its words; a sentence naming a code is left out; nothing left says the outcome", () => {
    expect(said("blocked", "The builder ended this brief blocked: The option is turned off on the item's page, so the item cannot be added this way."))
      .toBe("The builder stopped: The option is turned off on the item's page, so the item cannot be added this way.");
    expect(said("partial", "The list was empty. Its read answered web.extract.none_found.")).toBe("The list was empty.");
    expect(said("blocked", "core.run_node answered web.handle.unknown")).toBe("The builder couldn't finish this part.");
    expect(said("done", "")).toBe("The builder finished this part.");
  });
});

describe("the cards Core sends", () => {
  let seen: ClientGatewayActivity[] = [];
  let unsubscribe: () => void = () => undefined;
  beforeEach(() => {
    seen = [];
    unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
  });
  afterEach(() => unsubscribe());
  const inBuild = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);

  it("a return card carries the person's words, on the card and the row alike", () => {
    inBuild(() => emitAutomationStudioProjectReturnCard({ returned: builderReturn((value) => Object.assign(value, { outcome: "blocked", reason: STOPPED })), brief: brief(), structurePlan: structurePlan() }));
    const event = seen[0]!;
    const words = "The builder couldn't finish: it kept trying without getting any further, so it was stopped.";
    expect(event.detail?.text).toBe(words);
    expect(event.detail?.project).toMatchObject({ kind: "return", reason: words });
  });

  it("a brief card names the parts it starts after by the plan's names, never its own, empty for none, and the wire keeps them", () => {
    const plan = structurePlan();
    const after = brief((value) => Object.assign(value, { entry: { caseId: "observed-current", predecessors: ["list_soups", "save_recipe", "list_soups"] } }), plan);
    inBuild(() => {
      emitAutomationStudioProjectBriefCard({ brief: after, structurePlan: plan, taskSpec: taskSpec() });
      emitAutomationStudioProjectBriefCard({ brief: brief((value) => Object.assign(value, { entry: { caseId: "observed-current", predecessors: [] } }), plan), structurePlan: plan, taskSpec: taskSpec() });
    });
    expect(seen[0]!.detail?.project).toMatchObject({ kind: "brief", after: ["List soups"] });
    expect(seen[1]!.detail?.project).toMatchObject({ after: [] });
    expect(boundedAutomationStudioProjectCard({ ...seen[0]!.detail!.project, after: ["List soups", 7, "  "] })).toMatchObject({ after: ["List soups"] });
  });
});
