// What the judge of a build's test is shown for a lasting step the test only
// checked, whose act a repair rerun did earlier in the build (`../landing.ts`,
// t443).
//
// Shaped like packet 0109 of live run `run-mv4dgmki-2b13db91` (R4b), on another
// kind of site: a saved Flow's seven steps re-authored after its run failed at
// the last one. Steps 3-6 are carried from the Flow and make the choices; step
// 7 does the lasting act and is withheld by the test. A rerun pressed step 7
// once (its record kept in `priorExecution`), and every later rerun of it was a
// check that overwrote the step's own record with `changed: no`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, navigate, replayed, report, verified, web } from "./draft-steps.ts";

const SHOP = "http://127.0.0.1:61777/shop/";
const ITEM = `${SHOP}teapot`;

const choice = (position: number, name: string): AutomationStudioFlowDraftStep =>
  web(position, "web.output.dom-click", { selector: `#c${position}`, accessibleName: name }, ITEM, { step: { id: `f${position}`, iteration: 0 } });

/** The act as it was pressed: effect applied, with where its rerun ran. */
const press = (rerunPlace: AutomationStudioFlowDraftStep["rerunPlace"], name = "Reserve"): NonNullable<AutomationStudioFlowDraftStep["priorExecution"]> => ({
  ...web(9, "web.output.dom-click", { selector: "#reserve", accessibleName: name }, ITEM, { consequences: ["create_new"] }),
  callId: "rerun.7", resultCode: "web.clicked", stateBefore: "item|empty", stateAfter: "item|1 reserved",
  changed: [{ words: "Reserved!", how: "appeared" }],
  ...(rerunPlace ? { rerunPlace } : {}),
  lasting: true
});

/** The withheld step as the later checks left it: a checked candidate whose own record says the check. */
function draft(prior?: NonNullable<AutomationStudioFlowDraftStep["priorExecution"]>, steps: { carried?: boolean } = {}): AutomationStudioFlowDraftStep[] {
  const choices = [choice(3, "Porcelain"), choice(4, "Large"), choice(5, "Gift wrap"), choice(6, "Quantity 3")];
  if (steps.carried === false) {
    for (const each of choices) Object.assign(each, { id: `d${each.position}`, iteration: each.position });
  }
  const act = web(7, "web.output.dom-click", { selector: "#reserve", accessibleName: "Reserve" }, ITEM, { consequences: ["create_new"], step: { id: "d9", standsFor: "f7", proposes: true } });
  if (prior) Object.assign(act, { effectApplied: false, resultCode: "core.replay.verified", checkedCandidate: { callId: "rerun.7.3", code: "core.replay.verified" }, priorExecution: prior });
  else Object.assign(act, { resultCode: "web.clicked" });
  return [navigate(1, SHOP), web(2, "web.output.dom-click", { selector: "#voucher", accessibleName: "Save voucher" }, SHOP, { step: { acts: ["a2"] } }), ...choices, act];
}

const explored = (steps: AutomationStudioFlowDraftStep[]) => automationStudioBuildTestResultSummary({
  steps,
  report: report([replayed(steps[0]!), verified(steps[1]!), ...steps.slice(2, 6).map(replayed), verified(steps[6]!)]),
  nodes: [],
  deniedEvidenceKeys: DENIED
}).buildTest!.steps.find((step) => step.step === 7)!;

describe("a withheld lasting step whose act a rerun did earlier in this build", () => {
  it("shows the landing, with the choices it ran after, when the rerun did the steps before it again first", () => {
    const step = explored(draft(press({ kind: "put_back", redone: ["d1", "d2", "f3", "f4", "f5", "f6"] })));

    expect(step).toMatchObject({ step: 7, outcome: "verified", withheld: true });
    expect(step.explored).toEqual({
      changed: "yes",
      resultCode: "web.clicked",
      stateChanged: true,
      landed: {
        counts: true,
        after: [
          { step: 1, target: [SHOP] },
          { step: 2, target: ["Save voucher"] },
          { step: 3, target: ["Porcelain"] },
          { step: 4, target: ["Large"] },
          { step: 5, target: ["Gift wrap"] },
          { step: 6, target: ["Quantity 3"] }
        ]
      }
    });
  });

  it("flags R4b's own landing -- its page loaded again with nothing before it done again -- and does not credit it", () => {
    const step = explored(draft(press({ kind: "put_back", redone: [], unknownBefore: 6 })));

    expect(step.explored).toMatchObject({ changed: "no", resultCode: "core.replay.verified", landed: { counts: false } });
    expect(step.explored?.landed?.why).toMatch(/without step 6 and the steps before it done again/u);
    expect(step.explored?.landed?.after).toBeUndefined();
  });

  it("does not credit a put-back that left steps before it out, as a page comparison would have", () => {
    expect(explored(draft(press({ kind: "put_back", redone: ["f3", "f4", "f5", "f6"] }))).explored)
      .toMatchObject({ changed: "no", landed: { counts: false, why: "steps 1, 2 before it were not done again first" } });
  });

  it("does not credit a press that ran on the page as it stood while steps come before it", () => {
    expect(explored(draft(press({ kind: "already_there" }))).explored).toMatchObject({ changed: "no", landed: { counts: false } });
  });

  it("flags a press that ran wherever the last call left the page", () => {
    expect(explored(draft(press({ kind: "start_page_unknown" }))).explored).toMatchObject({ changed: "no", landed: { counts: false, why: expect.stringMatching(/wherever the page was left/u) } });
  });

  it("does not credit a landing after a step that has changed since", () => {
    const steps = draft(press({ kind: "put_back", redone: ["d1", "d2", "f3", "f4", "f5", "f6"] }));
    steps[4]!.disposition = "dropped";
    expect(explored(steps).explored).toMatchObject({ changed: "no", landed: { counts: false, why: "a step it ran after has changed since" } });
  });

  it("does not credit a press of another control than the step has now, and names what it pressed", () => {
    expect(explored(draft(press({ kind: "put_back", redone: ["d1", "d2", "f3", "f4", "f5", "f6"] }, "Reserve later"))).explored)
      .toMatchObject({ changed: "no", landed: { counts: false, pressed: ["Reserve later"] } });
  });

  it("credits an ordinary press made after steps that all ran in this build, and flags one made after carried steps that had not", () => {
    expect(explored(draft(press(undefined), { carried: false })).explored).toMatchObject({ changed: "yes", landed: { counts: true } });
    expect(explored(draft(press(undefined))).explored).toMatchObject({ changed: "no", landed: { counts: false, why: "steps 3, 4, 5, 6 before it had not run in this build as they stand when it was done" } });
  });

  it("is today's packet for a step the build pressed as an ordinary call and never checked again: its own record, and no landing", () => {
    expect(explored(draft()).explored).toEqual({ changed: "yes", resultCode: "web.clicked" });
  });
});
