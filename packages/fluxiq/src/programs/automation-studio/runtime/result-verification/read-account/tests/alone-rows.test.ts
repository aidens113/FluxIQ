// The rows a condition removed by itself, named in the read account the judge
// is shown. Live run 15 (`run-muqj2bgb-d048ec37`) held 10 of 13 earbuds: the
// accessory rule `name not contains [...]` removed by itself three earbuds sold
// "with Wireless Charging Case", and its judge, told "rejected 20, 5 of them by
// itself" and nothing more, passed the result.
import { describe, expect, it } from "vitest";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";
import { earbudsAttempt, earbudsNode } from "./earbuds-read.ts";

/** The three true earbuds the accessory rule removed by itself on run 15, whole. */
const EARBUDS_REMOVED = [
  "Lumo Audio Drift Pro Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Touch Control, White",
  "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case",
  "Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case, Built-in Mic, Rose Gold"
];
const ACCESSORIES = ["Silicone Ear Tips Replacement, 6 Pairs", "Charging Case Replacement for Air Pro 2"];

/** The earbuds attempt as the run record holds a playback that sent its alone rows (`service/summaries/extraction-summary.ts`). */
function playedBack(aloneRows: unknown[]) {
  const attempt = earbudsAttempt();
  const extraction = attempt.metadata!.extraction as Record<string, unknown>;
  const conditions = { ...(extraction.conditions as object), alone: [0, 1, 0, 5], aloneRows };
  return earbudsAttempt({ metadata: { extraction: { ...extraction, conditions } } } as never);
}

const RUN_15_ALONE = [[], [{ name: "Budget Earbuds 3.9 stars" }], [], [...EARBUDS_REMOVED, ...ACCESSORIES].map((name) => ({ name }))];

describe("the rows a condition removed by itself", () => {
  it("are named in the condition's account, every one whole, and in the re-author's sentence", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(RUN_15_ALONE)], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    const accessoryRule = reads[0]?.conditions?.[3];
    expect(accessoryRule).toEqual({
      condition: "name not contains [\"ear tips\", \"charging case\"]",
      rejected: 16,
      alone: 5,
      leftOutOnlyByThis: [...EARBUDS_REMOVED, ...ACCESSORIES]
    });
    expect(reads[0]?.conditions?.[1]?.leftOutOnlyByThis).toEqual(["Budget Earbuds 3.9 stars"]);
    // A condition that removed nothing by itself names nothing.
    expect(reads[0]?.conditions?.[0]).not.toHaveProperty("leftOutOnlyByThis");
    const full = automationStudioResultReadSentence(reads[0]!, "full");
    expect(full).toContain(`rejected 16 rows, 5 of them by itself (removed by itself: ${JSON.stringify(EARBUDS_REMOVED[0])}, ${JSON.stringify(EARBUDS_REMOVED[1])}, ${JSON.stringify(EARBUDS_REMOVED[2])}`);
    // The failure record's brief sentence stays counts.
    expect(automationStudioResultReadSentence(reads[0]!, "brief")).not.toContain("Lumo");
  });

  it("say a label from a denied column or shaped like a credential as withheld, and still count it", () => {
    const aloneRows = [[], [], [], [{ name: EARBUDS_REMOVED[0] }, { name: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }, { password: "Trevio T5" }]];
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(aloneRows)], flowNodes: [earbudsNode()], deniedEvidenceKeys: ["password"] });
    expect(reads[0]?.conditions?.[3]?.leftOutOnlyByThis).toEqual([EARBUDS_REMOVED[0], "(withheld)", "(withheld)"]);
  });

  it("are not carried where the domain declared no keys, like the wording beside them", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(RUN_15_ALONE)], flowNodes: [earbudsNode()] });
    expect(JSON.stringify(reads)).not.toContain("Lumo");
    expect(reads[0]?.conditions?.[3]).toEqual({ rejected: 16, alone: 5 });
  });

  it("are absent from a read that sent none, which still says its counts", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [earbudsAttempt()], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    expect(reads[0]?.conditions?.every((condition) => !("leftOutOnlyByThis" in condition))).toBe(true);
  });
});

