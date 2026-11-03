// A kept row whose name alone does not write the request's item phrase, as the
// request writes it, is flagged under a stated threshold, and a yes that does
// not name it beside a quote of the request is held (t663, A8 towels
// `run-mvahlxuu-760d9e28`, fix 1b).
import { describe, expect, it } from "vitest";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultKeptNotNamingTheItem } from "../kept-not-naming-the-item.ts";
import { automationStudioRequestPhrases } from "../request-phrases.ts";
import { ORGANIZER, SCREW_PACKS, SCREW_REQUEST, screwRunSummary, screwWording } from "./kept-rows-fixture.ts";

const flags = (names: readonly string[]) => automationStudioResultKeptNotNamingTheItem(screwRunSummary(names), automationStudioRequestPhrases(SCREW_REQUEST));

const yes = (names: readonly string[], observed: string) => {
  const summary = screwRunSummary(names);
  return automationStudioResultVerdict({
    summary,
    diagnosis: { answersRequest: "yes", expected: "Every pack of wood screws with name and price.", observed },
    basis: "model",
    wording: screwWording(summary)
  });
};

const PLAIN_YES = "10 rows stored, each a pack of wood screws with a name and a price; nothing requested is missing.";

describe("a kept row whose name does not write the request's item phrase", () => {
  it("is flagged when every other kept row's name writes it, singular against plural included", () => {
    expect(flags([...SCREW_PACKS, ORGANIZER])).toEqual([
      expect.objectContaining({ kind: "item", nodeId: "read", missing: "wood screws", rows: [ORGANIZER], of: 10 })
    ]);
  });

  it("flags nothing when every kept row writes it", () => {
    expect(flags(SCREW_PACKS)).toEqual([]);
  });

  it("flags nothing past its threshold: two of ten rows without it, or fewer than four rows writing it", () => {
    expect(flags([...SCREW_PACKS.slice(0, 8), ORGANIZER, "Bramblecore Screw Bit Set, 12 Pieces"])).toEqual([]);
    expect(flags([...SCREW_PACKS.slice(0, 3), ORGANIZER])).toEqual([]);
  });

  it("flags nothing on a list whose names share no phrase of the request", () => {
    expect(flags(["Ironleaf Hex Bolts, 50 Pack", "Kestrel Lag Bolts", "Oakhollow Carriage Bolts", "Pinecrest Machine Screws", "Bramblecore Anchors", "Tidewell Washers"])).toEqual([]);
  });

  it("holds a yes that does not name the flagged row, and takes one that names it beside a quote of the request", () => {
    const names = [...SCREW_PACKS, ORGANIZER];
    const held = yes(names, PLAIN_YES);
    expect(held.verdict).toBe("unsure");
    expect(held.code).toBe("core.result.exclusion_evidence_missing");
    expect(held.exclusionEvidenceMissing).toEqual([expect.stringContaining(ORGANIZER)]);
    expect(held.exclusionEvidenceMissing![0]).toContain(`does not write "wood screws"`);
    const taken = yes(names, `${PLAIN_YES} The Ironleaf Wood Screw Organizer Case holds screws rather than being a pack, but the request asks for "every pack of wood screws" from "the fastener aisle", and I keep it.`);
    expect(taken.verdict).toBe("answers");
  });

  it("takes a plain yes over an ordinary list", () => {
    expect(yes(SCREW_PACKS, PLAIN_YES).verdict).toBe("answers");
  });
});
