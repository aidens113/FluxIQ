// What a dependent builder's opening look says of its entry (t638, t676). On
// three A8 Lab runs a later builder ended blocked as "already done": once for a
// part that only reads, and once when the act that did it was a press that
// declared nothing, which the note left out. The note now lists a possible act
// too, marked `possibly`, and says "end the brief blocked" only to a brief with
// a part that asks a lasting act.
import { describe, expect, it } from "vitest";
import { automationStudioSubflowEntryLeft, type AutomationStudioSubflowScope } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectBuildEntryNote } from "../entry-note.ts";

const scope = (lastingActs: string[]): AutomationStudioSubflowScope => ({
  buildId: "build.1", briefId: "brief-2", planDigest: "plan.1", subflowKey: "second", predecessors: ["first"],
  parts: [{ partId: "p2", sourceId: "instruction.1", text: "Keep the reading list", lastingActs }]
});
const prepared = { kind: "prepared" as const, predecessors: ["first"], runId: "run-1", acts: [] };
const LANDED = [{ act: "act-3", did: "trial step 2 pressed Save" }, { act: "act-4", did: "trial step 3 pressed Keep", possibly: true as const }];

describe("a dependent builder's entry note", () => {
  it("lists a possible act the preparation run landed, marked possibly, under the key the builder loop reads back", () => {
    const note = automationStudioProjectBuildEntryNote(scope(["create_new"]), prepared, undefined, LANDED)!;
    expect(note.predecessorsLeftOnSite).toEqual(LANDED);
    expect(note.note).toContain("An act marked possibly declared no lasting act, yet changed its own page, so it may be on the site too.");
    // The builder loop reads exactly these ids off its opening look to check a `doneBefore` claim (`flow-bootstrap/subflow-candidate/done-before.ts`).
    expect(automationStudioSubflowEntryLeft.acts({ seen: true, [automationStudioSubflowEntryLeft.entryKey]: note })).toEqual(["act-3", "act-4"]);
  });

  it("tells a brief whose part asks a lasting act to end blocked naming the part and the act", () => {
    const note = automationStudioProjectBuildEntryNote(scope(["create_new"]), prepared, undefined, LANDED)!;
    expect(note.note).toContain("what they did is already done, so do not do it again");
    expect(note.note).toContain("end the brief blocked naming that part and that act");
    expect(note.note).toContain("\"doneBefore\": {\"part\": \"<the part's id>\", \"act\": \"<the act's id>\"}");
    expect(note.note).toContain("(only \"p2\" asks a lasting act)");
  });

  it("gives a brief whose parts only read no \"end the brief blocked\" sentence, with acts left or none", () => {
    const left = automationStudioProjectBuildEntryNote(scope([]), prepared, undefined, LANDED)!;
    expect(left.note).not.toContain("end the brief blocked");
    expect(left.note).not.toContain("already done");
    expect(left.note).toContain("Your parts ask for no lasting act, so none of these is a part of yours: build your parts from this page.");
    const none = automationStudioProjectBuildEntryNote(scope([]), prepared, ["act-1"])!;
    expect(none).toEqual({ prepared: true, note: "Before this first look, Core ran the passing proposals of the subflows before yours (\"first\") once, in order, so the site is where your subflow \"second\" begins. Explore and build from here.", absorbedByStartReset: ["act-1"] });
  });

  it("says nothing for a subflow the build's start begins, and why an unprepared entry was not prepared", () => {
    expect(automationStudioProjectBuildEntryNote(scope([]), { kind: "start" }, undefined)).toBeUndefined();
    const unprepared = automationStudioProjectBuildEntryNote(scope(["create_new"]), { kind: "unprepared", predecessors: ["first"], code: "subflow.trial_predecessor_missing", missing: ["first"], acts: [] }, undefined)!;
    expect(unprepared).toMatchObject({ prepared: false, code: "subflow.trial_predecessor_missing" });
    expect(unprepared.note).toContain("\"first\" has no proposal whose trial passed yet");
  });
});
