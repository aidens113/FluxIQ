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
      leftOutOnlyByThis: [...EARBUDS_REMOVED, ...ACCESSORIES],
      // Its read is the name column's own, and every row is labelled by the name.
      testedLabel: true
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

  // t195-w34, live run `run-murwcaj0-40e56557` (R6): shown only the labels, a judge read a regex that
  // dropped five mutual friends as one that kept them. A playback's stored row holds every column, its
  // label first (`service/summaries/extraction-summary.ts`); the account says the label with the value
  // its condition tested.
  it("say each row with the value its condition tested, by the column the condition reads", () => {
    const stored = (name: string, price: string) => ({ name, price, rating: "4.5 out of 5 stars", url: "" });
    const aloneRows = [[], [], [stored("Soundcrest Air Pro Max", "$89.99")], [stored(EARBUDS_REMOVED[0]!, "$26.99"), { name: "Budget Earbuds" }]];
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(aloneRows)], flowNodes: [earbudsNode()], deniedEvidenceKeys: [] });
    // The price condition reads the very column `price` reads, so it tested that column.
    expect(reads[0]?.conditions?.[2]?.leftOutOnlyByThis).toEqual(["Soundcrest Air Pro Max — price: $89.99"]);
    // The accessory rule tests the name, which is the label: the label alone; a row stored before then, too.
    expect(reads[0]?.conditions?.[3]?.leftOutOnlyByThis).toEqual([EARBUDS_REMOVED[0], "Budget Earbuds"]);
    const full = automationStudioResultReadSentence(reads[0]!, "full");
    expect(full).toContain(`(removed by itself: ${JSON.stringify("Soundcrest Air Pro Max — price: $89.99")})`);
  });

  it("say the value of a condition written over a column by its key, empty as no value, withheld as withheld", () => {
    const node = earbudsNode();
    const read = node.parameterValues!.extractList as Record<string, unknown>;
    const byKey = { ...node, parameterValues: { ...node.parameterValues, extractList: { ...read, fields: { ...(read.fields as object), mutualFriends: { kind: "text", selector: ".mutual" } }, where: [{ field: "rating", atLeast: 4 }, { field: "mutualFriends", matches: "(?:[5-9]|[1-9][0-9]+) mutual friend" }, { field: "seller", is: "present" }, { field: "price", lessThan: 50 }] } } };
    const aloneRows = [
      [{ name: "Budget Earbuds", rating: "" }],
      [{ name: "Jonas Weber", mutualFriends: "Aisha Khan and 4 other mutual friends" }],
      [{ name: "No Seller Earbuds", price: "$9.99" }],
      [{ name: "Gift Earbuds", price: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }]
    ];
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(aloneRows)], flowNodes: [byKey], deniedEvidenceKeys: [] });
    expect(reads[0]?.conditions?.map((condition) => condition.leftOutOnlyByThis)).toEqual([
      ["Budget Earbuds — rating: (no value)"],
      ["Jonas Weber — mutualFriends: Aisha Khan and 4 other mutual friends"],
      // A column the row does not hold says no value at all.
      ["No Seller Earbuds"],
      ["Gift Earbuds — price: (withheld)"]
    ]);
    expect(JSON.stringify(reads)).not.toContain("sk-live");
  });

  // Live run `run-mux6naez-6c20f26e` (lane C, round 3): the Flow stored name, price, rating and url, so
  // the plus and sponsored conditions' rows, their columns not stored, are said by label alone. Only the
  // authored condition says which one tested the label; the rows' shape cannot.
  it("run mux6naez: mark only the condition that tested the label's own column as testing the label", () => {
    const node = earbudsNode();
    const read = node.parameterValues!.extractList as Record<string, unknown>;
    const where = [{ field: "plus", is: "present" }, { field: "sponsored", is: "absent" }, { field: "name", contains: ["ear tips", "charging case"], not: true }];
    const byKey = { ...node, parameterValues: { ...node.parameterValues, extractList: { ...read, where } } };
    const stored = (name: string) => ({ name, price: "$29.99", rating: "4.5 out of 5 stars", url: "/dp/B0EXAMPLE" });
    const aloneRows = [
      [stored("Zephyrline Z1 Wireless Earbuds, Bluetooth 5.3 Headphones with 60H Playtime, Wireless Charging Case, Ear Hooks for Running, Midnight Blue")],
      [stored("Pulsebud Neo ANC Wireless Earbuds, Hybrid Active Noise Cancelling Bluetooth 5.4 Headphones, 50H Playtime, App EQ, Black")],
      ACCESSORIES.map(stored)
    ];
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [playedBack(aloneRows)], flowNodes: [byKey], deniedEvidenceKeys: [] });
    const conditions = reads[0]?.conditions ?? [];
    // Every row is said by its label alone, the tested cell of plus and sponsored not being stored.
    expect(conditions.slice(0, 3).map((condition) => condition.leftOutOnlyByThis?.every((row) => !row.includes(" — ")))).toEqual([true, true, true]);
    expect(conditions.map((condition) => condition.testedLabel)).toEqual([undefined, undefined, true, undefined]);
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

