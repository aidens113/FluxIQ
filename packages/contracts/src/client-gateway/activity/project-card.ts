/**
 * On a `note` row only: a card of the supervisor's work. Optional and additive;
 * a client that does not know it reads the row as a plain note. Core bounds
 * every string to 160 characters (`reason` to 240) and `parts` and `subflows`
 * to 20 entries each.
 *
 * A `brief`'s `after` names, by the plan's names, the subflows it starts after
 * (its entry's predecessors), at most 20: a brief dispatched beside one of
 * them waits for it to pass before its builder starts. Empty when it starts
 * after none; additive: absent only from an older Core, whose client cannot
 * tell. A `return`'s `reason` is said for the person, never a code, a call or
 * an id.
 */
export type ClientGatewayActivityProjectCard =
  | {
      kind: "plan";
      parts: Array<{ id: string; words: string }>;
      subflows: Array<{ key: string; name: string; purpose: string; parts: string[] }>;
      cases?: Array<{ subflowKey: string; caseId: string }>;
      budget?: Array<{ subflowKey: string; usd: number }>;
      reserveUsd?: number;
    }
  | {
      kind: "brief";
      briefId: string;
      brief: "build" | "survey" | "repair" | "reset";
      subflowKey: string;
      subflowName: string;
      purpose: string;
      caseId?: string;
      allowanceUsd: number;
      after?: string[];
    }
  | { kind: "return"; briefId: string; subflowKey: string; outcome: "done" | "partial" | "blocked"; reason: string; spentUsd: number; calls: number; trials: number }
  | { kind: "receipt"; briefId?: string; receipt: "subflow_trial" | "candidate_trial"; receiptId: string; verdict: "passed" | "failed" | "unconfirmed" };
