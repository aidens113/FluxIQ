import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, type AutomationStudioSiteResetSpot } from "../../site-reset/index.ts";
import { automationStudioSiteResetAdmission as admission, type AutomationStudioSiteResetAdmissionKnown, type AutomationStudioSiteResetAdmissionInput } from "../index.ts";

// The one admission every door asks (t751, R3): each rule in its order, over a
// structural port. Made-up fixtures only: pinning a print to a gallery wall,
// opaque tokens, none of the realistic sites' words.

const SITE = "r:gallery";
/** "Pin to my wall" on a print's own page: about the print, in no list. */
const PIN: AutomationStudioSiteResetSpot = { subject: "s:print", page: "s:print", scope: "p:print-page", resource: SITE };
/** The same press on a row of the wall itself. */
const ROW: AutomationStudioSiteResetSpot = { subject: "s:sketch", item: "i:sketch", scope: "p:wall", resource: SITE };
/** A star with a stated state at its place. */
const STAR: AutomationStudioSiteResetSpot = { ...PIN, place: "pl:star", state: "st:off" };
/** "Copy" on an untitled row of a list never read complete, on a page with a heading. */
const COPY: AutomationStudioSiteResetSpot = { item: "i:untitled", page: "s:wall-page", scope: "p:unread", resource: SITE };

const declared = (control: AutomationStudioSiteResetSpot, consequences: AutomationStudioActionConsequence[] = ["modify_existing"], effect: AutomationStudioActionEffect = "mutate") => ({ effect, consequences, control: { name: "Pin to my wall", kind: "button", ...control } });
// The witness rules refuse at the step door only (t775): the exploration door admits a press with no witness (below).
const input = (control: AutomationStudioSiteResetSpot, consequences?: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetAdmissionInput> = {}): AutomationStudioSiteResetAdmissionInput => ({ declared: declared(control, consequences), door: "step", ...extra });

/** Nothing read, nothing issued, nothing explored; `destination-1` alone is issued where a test says so. */
const port = (over: Partial<AutomationStudioSiteResetAdmissionKnown> = {}): AutomationStudioSiteResetAdmissionKnown => ({
  unissued: (reference) => reference !== undefined,
  destination: () => undefined,
  original: () => undefined,
  issuedRefs: () => [],
  here: () => [],
  explored: () => [],
  ...over
});
const issuedOne = (): Partial<AutomationStudioSiteResetAdmissionKnown> => ({
  unissued: (reference) => reference !== undefined && reference !== "destination-1",
  issuedRefs: () => [{ ref: "destination-1", count: 2, location: "loc:wall" }]
});
const WITNESS = { kind: "refused", evidence: { ok: false, code: "candidate.reset_witness_required", failed: "no_witness", canMeet: "another_page" } };
const CREATE = { kind: "refused", evidence: { ok: false, code: "candidate.create_baseline_required", failed: "no_destination_original", canMeet: "another_page" } };
const REALISTIC = /\b(store|shop|cart|basket|checkout|address|job|save|saved|heart|photo|like|liked|post|friend|order|product|follow|feed|profile|apply)\b/iu;
const instruction = (verdict: ReturnType<typeof admission>): string => (verdict.kind === "refused" ? String(verdict.evidence.instruction) : "");

describe("rule 1: what is not a reversible lasting press keeps its policy", () => {
  it("admits with no witness: an observation, no consequences, an irreversible or mixed press", () => {
    for (const [effect, consequences] of [
      ["observe", []], ["mutate", []], ["mutate", ["send_or_publish"]], ["mutate", ["move_money"]],
      ["mutate", ["modify_existing", "move_money"]], ["mutate", ["create_new", "send_or_publish"]]
    ] as const) expect(admission({ declared: declared(PIN, [...consequences], effect), door: "exploration" }, port())).toEqual({ kind: "admit" });
  });
});

describe("rule 2: a reference no receipt printed", () => {
  it("is refused unrun as today, on a press and on a look", () => {
    const unissued = { kind: "refused", evidence: { ok: false, code: "candidate.reset_destination_unissued", failed: "destination_unissued", canMeet: "this_page" } };
    expect(admission(input(PIN, ["modify_existing"], { reference: "destination-7" }), port(issuedOne()))).toMatchObject(unissued);
    expect(admission({ declared: declared({}, [], "observe"), reference: "destination-7", door: "exploration" }, port(issuedOne()))).toMatchObject(unissued);
    expect(admission(input(PIN, ["modify_existing"], { reference: 7 }), port(issuedOne()))).toMatchObject(unissued);
    expect(instruction(admission(input(PIN, ["modify_existing"], { reference: "destination-7" }), port()))).toBe(WORDS.destinationUnissued());
    // An identified creation keeps its own code for it, as before.
    expect(admission(input(PIN, ["create_new"], { reference: "destination-7" }), port(issuedOne()))).toMatchObject(CREATE);
  });
});

describe("rule 3: an unscoped press keeps the legacy policy", () => {
  it("admits a press naming no subject, page or scope with the legacy witness", () => {
    expect(admission(input({}, undefined, { door: "exploration" }), port())).toEqual({ kind: "admit", witness: { via: "legacy" } });
    expect(admission(input({ item: "i:new", resource: SITE }, ["create_new"], { door: "exploration" }), port())).toEqual({ kind: "admit", witness: { via: "legacy" } });
    expect(admission(input({ resource: SITE, place: "pl:x", state: "st:on" }, ["delete"], { door: "exploration" }), port())).toEqual({ kind: "admit", witness: { via: "legacy" } });
  });
});

describe("rule 4: an identified creation", () => {
  const destination = { ref: "destination-1", scope: "p:wall", group: "g:wall" };

  it("is admitted on the original its reference or own scope names, with that destination as witness", () => {
    const seen: unknown[] = [];
    const known = port({
      ...issuedOne(),
      destination: (_declared, reference) => {
        seen.push(reference);
        return reference === "destination-1" ? destination : undefined;
      }
    });
    expect(admission(input(PIN, ["create_new"], { reference: "destination-1" }), known)).toEqual({ kind: "admit", witness: { via: "destination", ...destination } });
    expect(seen).toEqual(["destination-1"]);
  });

  it("is admitted repeating a witnessed explored creation, and refused repeating an unwitnessed one", () => {
    const explored = (witnessed: boolean) => port({ explored: () => [{ id: "act-3", consequences: ["create_new"], operation: "gallery.pin", spot: PIN, witnessed }] });
    expect(admission(input(PIN, ["create_new"], { operation: "gallery.pin" }), explored(true))).toEqual({ kind: "admit", witness: { via: "repeats", act: "act-3" } });
    expect(admission(input(PIN, ["create_new"], { operation: "gallery.pin" }), explored(false))).toMatchObject(CREATE);
    expect(admission(input(PIN, ["create_new"], { operation: "gallery.frame" }), explored(true))).toMatchObject(CREATE);
  });

  it("is refused with nothing, met on another page even with no original at all, never by no call", () => {
    const verdict = admission(input(PIN, ["create_new"]), port());
    expect(verdict).toMatchObject(CREATE);
    expect(instruction(verdict)).toBe(WORDS.stepWitnessRequired([]));
  });

  it("names every ref already issued, with where it was read (t748, C5)", () => {
    const known = port({ issuedRefs: () => [{ ref: "destination-1", count: 1, location: "loc:hall" }, { ref: "destination-2", count: 3 }], here: () => ["destination-2"] });
    const said = instruction(admission(input(PIN, ["create_new"]), known));
    expect(said).toContain("destination-1 (1 item at loc:hall), destination-2 (3 items)");
    expect(said).not.toMatch(REALISTIC);
  });

  it("admits at the exploration door, with no witness, what the step door refuses for want of one (t775)", () => {
    for (const consequences of [["create_new"], ["modify_existing"], ["delete"]] as AutomationStudioActionConsequence[][]) {
      expect(admission(input(PIN, consequences), port())).toMatchObject({ kind: "refused" });
      expect(admission(input(PIN, consequences, { door: "exploration" }), port())).toEqual({ kind: "admit" });
    }
  });

  it("is identified by its page where it sits in no item; an untitled one in an item is not (rule 5)", () => {
    expect(admission(input({ page: "s:print", scope: "p:print-page", resource: SITE }, ["create_new"]), port())).toMatchObject(CREATE);
    expect(admission(input(COPY, ["create_new"]), port())).toMatchObject(WITNESS);
  });
});

describe("rule 5: any other reversible scoped press", () => {
  it("is witnessed by an issued ref naming its destination first", () => {
    const destination = { ref: "destination-1", scope: "p:wall", group: "g:wall" };
    const known = port({ ...issuedOne(), destination: (_declared, reference) => (reference === "destination-1" ? destination : undefined), original: () => ({ scope: "p:print-page", group: "g:page" }) });
    expect(admission(input(PIN, ["modify_existing"], { reference: "destination-1" }), known)).toEqual({ kind: "admit", witness: { via: "destination", ...destination } });
    expect(admission(input(COPY, ["create_new"], { reference: "destination-1" }), known)).toEqual({ kind: "admit", witness: { via: "destination", ...destination } });
  });

  it("is witnessed by the list its control sits in, read complete as an original of its resource", () => {
    const asked: string[] = [];
    const known = port({
      original: (scope, resource) => {
        asked.push(`${scope}|${resource}`);
        return scope === "p:wall" && resource === SITE ? { scope, group: "g:wall" } : undefined;
      }
    });
    expect(admission(input(ROW, ["delete"]), known)).toEqual({ kind: "admit", witness: { via: "own_list", scope: "p:wall", group: "g:wall" } });
    expect(asked).toEqual([`p:wall|${SITE}`]);
    expect(admission(input({ ...ROW, resource: "r:elsewhere" }, ["delete"]), known)).toMatchObject(WITNESS);
  });

  it("is witnessed by its own control's place only where it declares exactly modify_existing with a state there", () => {
    expect(admission(input(STAR), port())).toEqual({ kind: "admit", witness: { via: "control", place: "pl:star" } });
    expect(admission(input(STAR, ["delete"]), port())).toMatchObject(WITNESS);
    expect(admission(input(STAR, ["create_new", "modify_existing"]), port())).toMatchObject(WITNESS);
    expect(admission(input({ ...PIN, place: "pl:star" }), port())).toMatchObject(WITNESS);
  });

  it("is witnessed by a witnessed explored act it repeats, the operation standing for the step's definition", () => {
    const explored = port({ explored: () => [
      { id: "act-1", consequences: ["modify_existing"], operation: "gallery.pin", spot: PIN, witnessed: false },
      { id: "act-2", consequences: ["modify_existing"], operation: "gallery.pin", spot: PIN, witnessed: true }
    ] });
    expect(admission(input(PIN, ["modify_existing"], { operation: "gallery.pin", door: "step" }), explored)).toEqual({ kind: "admit", witness: { via: "repeats", act: "act-2" } });
    expect(admission(input(PIN, ["modify_existing"], { door: "step" }), explored)).toEqual({ kind: "admit", witness: { via: "repeats", act: "act-2" } });
    expect(admission(input(PIN, ["modify_existing"], { operation: "gallery.frame", door: "step" }), explored)).toMatchObject(WITNESS);
    expect(admission(input({ ...PIN, subject: "s:other", page: "s:other" }, ["modify_existing"], { operation: "gallery.pin" }), explored)).toMatchObject(WITNESS);
    expect(admission(input(PIN, ["delete"], { operation: "gallery.pin" }), explored)).toMatchObject(WITNESS);
  });

  it("is refused with none, naming the refs already issued, in generic words", () => {
    const verdict = admission(input(PIN), port(issuedOne()));
    expect(verdict).toMatchObject(WITNESS);
    expect(instruction(verdict)).toBe(WORDS.stepWitnessRequired([{ ref: "destination-1", count: 2, location: "loc:wall" }]));
    expect(instruction(verdict)).toContain("destination-1 (2 items at loc:wall)");
    expect(instruction(verdict)).not.toMatch(REALISTIC);
    // A delete and a mixed reversible press are held to it too.
    expect(admission(input({ ...ROW, scope: "p:unread" }, ["delete"]), port())).toMatchObject(WITNESS);
    expect(admission(input(PIN, ["create_new", "modify_existing"]), port())).toMatchObject(WITNESS);
  });

  it("asks no seal: the same press is refused after any earlier lasting act exactly as before one", () => {
    // The port has no seal at all (R3): admission depends only on witnesses.
    const known = port();
    expect(admission(input(PIN), known)).toEqual(admission(input(PIN), known));
    expect(admission(input(PIN), known)).toMatchObject(WITNESS);
  });
});

describe("the step door", () => {
  it("decides by the same rules, and words a refusal for a step, which can carry no resetDestination", () => {
    const verdict = admission(input(PIN, ["modify_existing"], { door: "step" }), port(issuedOne()));
    expect(verdict).toMatchObject(WITNESS);
    expect(instruction(verdict)).toBe(WORDS.stepWitnessRequired([{ ref: "destination-1", count: 2, location: "loc:wall" }]));
    expect(instruction(verdict)).toContain("while exploring");
    expect(instruction(verdict)).not.toMatch(REALISTIC);
    const creation = admission(input(PIN, ["create_new"], { door: "step" }), port());
    expect(creation).toMatchObject(CREATE);
    expect(instruction(creation)).toBe(WORDS.stepWitnessRequired([]));
    expect(admission(input(STAR, ["modify_existing"], { door: "step" }), port())).toEqual({ kind: "admit", witness: { via: "control", place: "pl:star" } });
  });
});
