export type DraftWithdrawalFacts = { kind: "partner_absent" } | {
  kind: "unpaired" | "paired_first" | "paired_later";
  partner: number;
  first: number;
  later: number;
  previouslyChosen: boolean;
};
