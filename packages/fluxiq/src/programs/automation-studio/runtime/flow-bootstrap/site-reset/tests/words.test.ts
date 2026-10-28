import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../index.ts";

// The words an undo aimed at another item's control is refused with (t475),
// as a candidate build and a reset brief are told them (t591, social debug
// fix 4): a reset has no test to run. Since t775 no word says acts are undone
// before a trial: a trial runs on the site as it stands and is judged by its
// change; only the targeted refusal asks for one act to be undone.

const REALISTIC = /\b(store|shop|cart|basket|checkout|address|job|save|saved|heart|photo|like|liked|post|friend|order|product|follow|feed|profile|apply)\b/iu;
/** A sentence saying acts are undone before every trial (t775 retires it). */
const BEFORE_EVERY_TRIAL = /before (every|each|the next|another|an ordinary) trial|put the site back the way this build found it|admits no trial|no trial can run/iu;

describe("site reset words for an undo aimed at another item", () => {
  it("keeps an unproved inverse refused and requires an explicit other act claim", () => {
    // t743: the words point at the named condition instead of sending the model off to inspect.
    expect(WORDS.unprovedUndo(false)).toContain("for the reason under condition");
    expect(WORDS.unprovedUndo(false)).not.toContain("Inspect what this build created");
    expect(WORDS.unprovedUndo(false)).not.toContain("Another recorded act");
    const words = WORDS.unprovedUndo(true);
    expect(words).toContain("Another recorded act");
    expect(words).toContain("explicitly name its id");
    expect(words).toContain("only once fresh complete reads show it as this build found it");
    expect(words).toContain("was not run");
  });

  it("reports a wrong target as staying on the site, its judge told", () => {
    expect(WORDS.wrongTarget()).toContain("This act stays on the site; every trial's judge is told it was there");
    expect(WORDS.wrongTarget()).not.toContain("the next trial runs with it already done");
    expect(WORDS.undoRefused()).not.toContain("the next trial runs with it already done");
    expect(WORDS.alreadyUndone(true)).toContain("A changed page alone does not show an effect in another collection put back");
  });

  it("keeps a refused undo subject to the current settlement conditions", () => {
    const words = WORDS.undoRefused();
    expect(words).toContain("nothing was done");
    expect(words).toContain("Do not repeat the refused effect");
    expect(words).toContain("current listed reset and settlement conditions");
    expect(words).toContain("end honestly");
    expect(words).not.toContain("startedWith.cannotUndo");
  });

  it("tells a reset to undo another listed act or name the acts it cannot undo under cannotUndo, and never to test", () => {
    const said = WORDS.wrongTarget("reset");
    expect(said).toContain("Undo another listed act on its own item with \"undoes\"");
    expect(said).toContain("complete and name those acts under cannotUndo");
    expect(said).not.toMatch(/test|revision/iu);
  });

  it("never says acts are undone before a trial, in any answer (t775)", () => {
    for (const said of [WORDS.unprovedUndo(true), WORDS.wrongTarget(), WORDS.wrongTarget("reset"), WORDS.undoRefused(), WORDS.alreadyUndone(true), WORDS.alreadyUndone(false),
      WORDS.keptAct(), WORDS.keptAct(true), WORDS.alreadyBack(), WORDS.alreadyBack(true), WORDS.unknownAct(true), WORDS.startedWith(true), WORDS.actionDeclarations(),
      WORDS.stepWitnessRequired([]), WORDS.retryRefused("call.1", [{ ref: "destination-1", count: 1 }]), WORDS.settleModel()]) {
      expect(said).not.toMatch(BEFORE_EVERY_TRIAL);
      expect(said).not.toMatch(REALISTIC);
    }
  });
});

describe("the one targeted refusal before a trial (t775)", () => {
  it("names just the act to undo, says why the trial could not show the step, and to test the same revision again", () => {
    const said = WORDS.startsInEndState();
    expect(said).toContain("actsToUndo");
    expect(said).toContain("a different step");
    expect(said).toContain("Undo just that act with core.run_node");
    expect(said).toContain("leave everything else as it is");
    expect(said).toContain("test the same revision again");
    expect(said).not.toMatch(REALISTIC);
  });

  it("says a trial on a site the build already changed is judged by its change", () => {
    const said = WORDS.startedWith(false);
    expect(said).toContain("nothing was undone first");
    expect(said).toContain("judges the trial by what changed from the state just before it");
    expect(said).not.toContain("cannotUndo");
    expect(WORDS.startedWith(true)).toContain("cannotUndo");
  });
});

// Rerun round 3 (office `run-mvgo5xft-25460ba2`): what a look under undoes
// settled, and a resetDestination named with no act, are said in generic words.
describe("site reset words for what a look settled", () => {
  it("says whether the named act settled, and points at the acts still open", () => {
    const settled = WORDS.lookSettled(true, true);
    expect(settled).toContain("settled the act it named under undoes");
    expect(settled).toContain("do not name it again");
    expect(settled).toContain("actsStillOpen");
    expect(WORDS.lookSettled(true, false)).toContain("No act of this build is still open");
    const open = WORDS.lookSettled(false, true);
    expect(open).toContain("has not settled the act it named under undoes");
    expect(open).toContain("settle");
  });

  it("says a resetDestination with no undoes settled nothing, and how to name both", () => {
    const words = WORDS.destinationWithoutUndoes(true);
    expect(words).toContain("settled nothing");
    expect(words).toContain("\"undoes\"");
    expect(words).toContain("example");
    expect(WORDS.destinationWithoutUndoes(false)).not.toContain("example");
    for (const said of [words, WORDS.lookSettled(true, true), WORDS.lookSettled(false, true)]) expect(said).not.toMatch(REALISTIC);
  });
});

// t743 (photo rerun round 4 `run-mvgw7320-de416190`, fix 2) and t775: the guidance asks for a destination only where no
// other witness exists, as the place a lasting step's change shows, and names a list on a page that loads at its own URL.
describe("site reset guidance on destinations", () => {
  it("asks for a destination only for a press with no other witness, and names a list on a page at its own URL", () => {
    const guidance = WORDS.actionDeclarations();
    expect(guidance).toContain("For a reversible lasting press that has no other witness");
    expect(guidance).toContain("a control that shows its own state, or one inside a list already read complete, needs none");
    expect(guidance).toContain("A trial is judged by what it changed from the state just before it");
    expect(guidance).toContain(WORDS.ownUrl());
    expect(WORDS.ownUrl()).toContain("loads at its own URL");
    expect(WORDS.stepWitnessRequired([])).toContain(WORDS.ownUrl());
    for (const said of [guidance, WORDS.stepWitnessRequired([]), WORDS.alreadyBack()]) expect(said).not.toMatch(REALISTIC);
  });
});

describe("site reset words for an undo already back (t743)", () => {
  it("say already back without asking to inspect, and keep the other answer words generic", () => {
    expect(WORDS.alreadyBack()).toContain("nothing to press");
    expect(WORDS.alreadyBack()).not.toMatch(/inspect/iu);
    for (const words of [WORDS.alreadyBack(), WORDS.unprovedUndo(true), WORDS.actionDeclarations()]) expect(words).not.toMatch(REALISTIC);
  });
});

// Office rounds 2-4 (t748, C6): after a complete read issued the ref a refused press needed, nothing said to press it
// again with that ref. The read's answer now says so.
describe("site reset words after a read issues refs a refused press wants (t748)", () => {
  it("name the refused call and the refs just issued, and say to press it again naming the one where its effect shows", () => {
    const words = WORDS.retryRefused("press.missing", [{ ref: "destination-2", count: 3 }, { ref: "destination-3", count: 0, location: "loc:lists" }]);
    expect(words).toContain("\"press.missing\"");
    expect(words).toContain("destination-2 (3 items), destination-3 (0 items at loc:lists)");
    expect(words).toContain("naming that list's ref as resetDestination");
    expect(words).toContain("pressing the control by its handle in the newest view");
    expect(words).toContain("If none of them is where its effect would show, make the call again without resetDestination");
    expect(words).not.toMatch(REALISTIC);
  });
});

// t751 (R3) and t775: a plan step, which can carry no resetDestination, is told to name where its change shows, made
// while exploring.
describe("site reset words for a step with no witness (t751, t775)", () => {
  it("tell a step to name where its change shows, pressing its control once while exploring", () => {
    const said = WORDS.stepWitnessRequired([{ ref: "destination-1", count: 2, location: "loc:wall" }]);
    expect(said).toContain("Name where this step's change shows, so its trial can be judged by the change");
    expect(said).toContain("while exploring");
    expect(said).toContain("core.run_node");
    expect(said).toContain("resetDestination");
    expect(said).toContain("then submit again");
    expect(said).toContain("destination-1 (2 items at loc:wall)");
    expect(said).toContain(WORDS.ownUrl());
    expect(WORDS.stepWitnessRequired([])).not.toContain("Refs already issued");
    for (const words of [said, WORDS.stepWitnessRequired([])]) expect(words).not.toMatch(REALISTIC);
  });
});
