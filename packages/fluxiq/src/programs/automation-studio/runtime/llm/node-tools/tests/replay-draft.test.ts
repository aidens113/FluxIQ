// A dry run on a site that remembers what exploring did (t195-w20b).
//
// The dry run's reset is a navigation only (decision D1), so it runs on the
// state exploration left. The audits of three scenarios showed the steps that
// can then never replay, and every completion was refused for them:
//
//   - pickup-order (t195-w19b, #1 and #2): after the real order the cart is
//     empty, the consent and offer are answered, the guest checkout and the
//     slot fetch are remembered;
//   - apply-quillmark (t195-w19d, C4): "I'm a person" and the confirmation read
//     come after a Submit the dry run withholds, on the form's own page;
//   - confirm-requests run 33 (t195-w19a, B1): a kept consent press.
//
// The host here answers the way the web binding does: a target that is there
// replays (a check of it is verified); a target that is not there is
// `remembered` (`present` for a check) when the replay stands on the page the
// step acted on, and `unreproducible` anywhere else.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftReplayOutcomeWord,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import { replayAutomationStudioFlowDraft } from "../index.ts";

const HOME = "https://bigbox.test/";
const PRODUCT = "https://bigbox.test/p/towels";
const CART = "https://bigbox.test/cart";
const CHECKOUT = "https://bigbox.test/checkout";
const CONFIRMATION = "https://bigbox.test/order/confirmation";

/** One step of a draft, and how the site answers it now. */
type SiteStep = {
  node: string;
  from: string;
  consequences?: string[];
  effect?: "observe" | "mutate";
  /** Whether its target is on the site now. */
  there: boolean;
  /** Where a press that ran leaves the page. */
  moves?: string;
  /** A fixed answer, for a step this site does not model. */
  answer?: string;
};

const draft = (site: SiteStep[]): AutomationStudioFlowDraftStep[] => site.map((each, index) => {
  const consequences = each.consequences ?? [];
  return {
    position: index + 1,
    id: `d${index + 1}`,
    iteration: index + 1,
    actionId: each.node,
    toolId: "core.run_node",
    input: { node: each.node, parameters: {}, consequences },
    ranWith: { node: each.node, parameters: { selector: `#${each.node}` }, consequences },
    effect: each.effect ?? "mutate",
    effectApplied: true,
    disposition: "kept",
    proposes: true,
    replay: { from: { location: each.from }, ...(each.effect === "observe" ? { produced: { records: 1 } } : {}) }
  };
});

const answer = (code: string, effectApplied = false): AutomationStudioLlmEvidenceToolExecutionResult =>
  ({ kind: "llm_evidence_tool_execution", evidence: { said: code }, effectApplied, resultCode: code });

/**
 * The site: where the page stands, what each call asked, and the answers.
 * `redirects` sends a reset for one location to another, the way a checkout
 * with nothing in the cart sends a shopper back to the cart.
 */
function site(steps: SiteStep[], options: { redirects?: Record<string, string>; reanchorFails?: true } = {}) {
  let at = "";
  const calls: { callId: string; value: JsonObject }[] = [];
  const byNode = new Map(steps.map((each) => [each.node, each]));
  const executeTool = async ({ callId, value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    const from = (value.from as { location?: string } | undefined)?.location;
    if (value.replay === "reset") {
      if (options.reanchorFails && callId.endsWith(".reanchor")) return answer("core.replay.reset_failed");
      at = options.redirects?.[from ?? ""] ?? from ?? "";
      return answer("core.replay.replayed", true);
    }
    const step = byNode.get(String(value.node))!;
    if (step.answer) return answer(step.answer, step.answer === "core.replay.replayed");
    if (step.there) {
      if (value.replay === "verify") return answer("core.replay.verified");
      if (step.moves) at = step.moves;
      return answer("core.replay.replayed", true);
    }
    if (from !== undefined && from === at) return answer(value.replay === "verify" ? "core.replay.present" : "core.replay.remembered");
    return answer("core.replay.unreproducible");
  };
  return { calls, executeTool };
}

const replay = (steps: SiteStep[], options?: Parameters<typeof site>[1]) => {
  const host = site(steps, options);
  return { host, replayed: replayAutomationStudioFlowDraft({ steps: draft(steps), attempt: 1, executeTool: host.executeTool }) };
};

const lines = (outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]) =>
  outcomes.map((outcome) => [outcome.step, automationStudioFlowDraftReplayOutcomeWord(outcome), outcome.reanchored ?? false, outcome.withheldBy ?? null]);

const resets = (calls: readonly { callId: string; value: JsonObject }[]) => calls.filter((each) => each.value.replay === "reset").map((each) => each.callId);

/** Bigbox after the real order (t195-w19b §a): the chain a correct build keeps. */
const PICKUP: SiteStep[] = [
  { node: "node.go_home", from: HOME, there: true, moves: HOME },
  { node: "node.accept_all", from: HOME, there: false },
  { node: "node.no_thanks", from: HOME, there: false },
  { node: "node.open_towels", from: HOME, there: true, moves: PRODUCT },
  { node: "node.add_to_cart", from: PRODUCT, consequences: ["create_new"], there: true },
  // Add to cart was checked, not run, so its "Added to cart" panel never opened.
  { node: "node.view_cart", from: PRODUCT, there: false },
  // The soap's line went with the order.
  { node: "node.save_for_later", from: CART, consequences: ["modify_existing"], there: false },
  // No bar on an empty cart.
  { node: "node.continue_to_checkout", from: CART, there: false },
  // The guest checkout and the slot fetch are remembered.
  { node: "node.continue_as_guest", from: CHECKOUT, there: false },
  { node: "node.retry_slots", from: CHECKOUT, there: false },
  { node: "node.slot_2pm", from: CHECKOUT, there: true },
  { node: "node.type_name", from: CHECKOUT, there: true },
  { node: "node.type_phone", from: CHECKOUT, there: true },
  { node: "node.place_order", from: CHECKOUT, consequences: ["move_money"], there: true },
  { node: "node.read_order", from: CONFIRMATION, effect: "observe", there: false }
];

describe("a dry run on a site that remembers what exploring did", () => {
  it("passes pickup-order's chain after the real order, keeping every step it needs on a fresh site", async () => {
    const { host, replayed } = replay(PICKUP);
    const { verdict } = await replayed;
    expect(lines(verdict.outcomes)).toEqual([
      [1, "replayed", false, null],
      [2, "remembered", false, null],
      [3, "remembered", false, null],
      [4, "replayed", false, null],
      [5, "verified", false, null],
      [6, "remembered", false, null],
      // Looked for on the product page first, after View cart was remembered:
      // asked again on the cart, where its line is gone.
      [7, "present", true, null],
      [8, "remembered", false, null],
      [9, "remembered", true, null],
      [10, "remembered", false, null],
      [11, "replayed", false, null],
      [12, "replayed", false, null],
      [13, "replayed", false, null],
      [14, "verified", false, null],
      // The order was withheld, so its confirmation is not there to read.
      [15, "unreproducible", false, 14]
    ]);
    expect(verdict.ok).toBe(true);
    // Each re-anchor is one reset to that step's own page, and no more.
    expect(resets(host.calls)).toEqual(["dryrun.1.reset", "dryrun.1.7.reanchor", "dryrun.1.9.reanchor"]);
    expect(host.calls.find((each) => each.callId === "dryrun.1.9.reanchor")?.value.from).toEqual({ location: CHECKOUT });
    expect(host.calls.filter((each) => each.callId.startsWith("dryrun.1.9")).map((each) => each.callId)).toEqual(["dryrun.1.9", "dryrun.1.9.reanchor", "dryrun.1.9.again"]);
  });

  it("sends a replayed step where it found the page, so the host can tell remembered from unreproducible", async () => {
    const { host, replayed } = replay(PICKUP.slice(0, 3));
    expect((await replayed).verdict.ok).toBe(true);
    expect(host.calls.find((each) => each.callId === "dryrun.1.2")?.value).toMatchObject({ replay: "step", from: { location: HOME } });
  });

  it("passes apply-quillmark's submit and both steps after it, excused by the withheld send", async () => {
    const CAREERS = "https://quillmark.test/careers/apply";
    const { host, replayed } = replay([
      { node: "node.type_cv", from: CAREERS, there: true },
      { node: "node.submit", from: CAREERS, consequences: ["send_or_publish"], there: true },
      { node: "node.confirm_person", from: CAREERS, there: false, answer: "core.replay.failed" },
      { node: "node.read_confirmation", from: CAREERS, effect: "observe", there: false, answer: "core.replay.unreproducible" }
    ]);
    const { verdict } = await replayed;
    expect(lines(verdict.outcomes)).toEqual([
      [1, "replayed", false, null],
      [2, "verified", false, null],
      [3, "failed", false, 2],
      [4, "unreproducible", false, 2]
    ]);
    expect(verdict.ok).toBe(true);
    // Excused steps are not asked again elsewhere.
    expect(resets(host.calls)).toEqual(["dryrun.1.reset"]);
  });
});

describe("what a dry run still refuses", () => {
  it("blocks a step missing on another page when the step before it replayed, without re-anchoring it", async () => {
    const { host, replayed } = replay([
      { node: "node.go_home", from: HOME, there: true, moves: HOME },
      { node: "node.open_towels", from: HOME, there: true, moves: PRODUCT },
      // Its page is the cart, which no step of this draft reaches (run 18).
      { node: "node.save_for_later", from: CART, there: false }
    ]);
    const { verdict } = await replayed;
    expect(lines(verdict.outcomes)).toEqual([[1, "replayed", false, null], [2, "replayed", false, null], [3, "unreproducible", false, null]]);
    expect(verdict.ok).toBe(false);
    expect(resets(host.calls)).toEqual(["dryrun.1.reset"]);
    expect(host.calls.at(-1)?.value).toMatchObject({ replay: "step", from: { location: CART } });
  });

  it("blocks a step whose re-anchor could not put the page back: it was looked for only on another page", async () => {
    const { host, replayed } = replay([
      { node: "node.go_home", from: HOME, there: true, moves: HOME },
      { node: "node.accept_all", from: HOME, there: false },
      { node: "node.continue_to_checkout", from: CART, there: false }
    ], { reanchorFails: true });
    const { verdict } = await replayed;
    expect(lines(verdict.outcomes)).toEqual([[1, "replayed", false, null], [2, "remembered", false, null], [3, "unreproducible", false, null]]);
    expect(verdict.ok).toBe(false);
    expect(resets(host.calls)).toEqual(["dryrun.1.reset", "dryrun.1.3.reanchor"]);
  });

  it("blocks a re-anchored step that is still not on its own page, and asks only once", async () => {
    const { host, replayed } = replay([
      { node: "node.go_home", from: HOME, there: true, moves: HOME },
      { node: "node.accept_all", from: HOME, there: false },
      { node: "node.continue_as_guest", from: CHECKOUT, there: false }
    ], { redirects: { [CHECKOUT]: CART } });
    const { verdict } = await replayed;
    expect(lines(verdict.outcomes)).toEqual([[1, "replayed", false, null], [2, "remembered", false, null], [3, "unreproducible", true, null]]);
    expect(verdict.ok).toBe(false);
    expect(resets(host.calls)).toEqual(["dryrun.1.reset", "dryrun.1.3.reanchor"]);
    expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toContain("core.replay.reanchored");
  });

  it("excuses nothing after a verified step that declared nothing a person is asked about, and everything after one that did", async () => {
    const FORM = "https://forms.test/profile";
    const steps = (consequences: string[]): SiteStep[] => [
      { node: "node.open_form", from: FORM, there: true, moves: FORM },
      { node: "node.save_profile", from: FORM, consequences, there: true },
      { node: "node.read_saved", from: FORM, effect: "observe", there: false, answer: "core.replay.changed" }
    ];
    const edited = await replay(steps(["modify_existing"])).replayed;
    expect(edited.verdict.ok).toBe(false);
    expect(edited.verdict.outcomes[2]?.withheldBy).toBeUndefined();
    const sent = await replay(steps(["send_or_publish"])).replayed;
    expect(sent.verdict.ok).toBe(true);
    expect(sent.verdict.outcomes[2]?.withheldBy).toBe(2);
  });
});
