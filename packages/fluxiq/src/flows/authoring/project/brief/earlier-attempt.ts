// What a build or repair brief carries of the earlier brief of its subflow whose
// builder Core's no-progress guard stopped for repeating calls that made no
// progress (live lane 1 fix 1, `run-mvcx8na6-9554a3f1`). That builder never
// submitted, so nothing could be repaired, and the supervisor's second brief
// was refused as one "its builder could only do the same". A builder stopped for
// repeating itself is the model's variance, not a brief that can only do the
// same: a fresh builder told what the last one tried can take another path. Core
// sets it (`../supervisor/dispatch-tool.ts`), never the supervisor
// (`../supervisor/brief-input.ts`), and the dispatcher shows it to the new
// builder (`../dispatch/run-brief.ts`).
//
// `reason` is the earlier return's own, which names the guard's codes and the
// calls it stopped on, latest first, by tool, node and result code
// (`../dispatch/ending.ts`): Core keeps no other account of that builder's
// decisions, and nothing the model wrote. `lastingActs` are the acts it made
// that the build's ledger still holds on the target, by the ledger's names.

export type AutomationStudioProjectEarlierAttempt = {
  briefId: string;
  kind: "build" | "repair";
  reason: string;
  lastingActs: Array<{ act: string; did: string }>;
};
