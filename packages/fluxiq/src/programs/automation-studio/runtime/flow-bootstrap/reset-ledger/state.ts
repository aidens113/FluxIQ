// What the site-reset ledger (`../site-reset/ledger.ts`) shares with the collaborators it
// is a facade over (t797, no change in behaviour): its acts, its reads and
// receipts, the settlement judge, and the counters every one of them moves.
// One object, held by the facade and by each collaborator, so a counter moved
// by one is the value the others read.

import type { AutomationStudioSiteResetControlTracker, AutomationStudioSiteResetObservations, AutomationStudioSiteResetSettlementJudge } from "../reset-settlement/index.ts";
import type {
  AutomationStudioSitePressNotes,
  AutomationStudioSiteResetControlWitnesses,
  AutomationStudioSiteResetCreateBaselines,
  AutomationStudioSiteResetLedgerOptions
} from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct } from "./act.ts";

/** One ledger's shared state (header). */
export type AutomationStudioSiteResetLedgerState = {
  readonly acts: AutomationStudioSiteResetLedgerAct[];
  readonly options: AutomationStudioSiteResetLedgerOptions;
  readonly createBaselines: AutomationStudioSiteResetCreateBaselines;
  readonly controlWitnesses: AutomationStudioSiteResetControlWitnesses;
  readonly pressNotes: AutomationStudioSitePressNotes;
  /** The complete lists this ledger has seen: originals and latest reads (`../reset-settlement/observations.ts`). */
  readonly seen: AutomationStudioSiteResetObservations;
  /** The stateful controls it has seen, and the presses on them (`../reset-settlement/control-tracker.ts`). */
  readonly tracker: AutomationStudioSiteResetControlTracker;
  /** Whether each act is settled, and what an open one still needs (`../reset-settlement/judge.ts`). */
  readonly judge: AutomationStudioSiteResetSettlementJudge;
  /** The next act number, where no `nextActId` gives ids. */
  next: number;
  /** Moves on every landed lasting call, undo and trial: a read is fresh only at the current value (`./answers.ts`, L1). */
  clock: number;
  /** Lasting acts recorded since the build began or since the last trial (`../site-reset/ledger.ts`, header). */
  recordedInPhase: number;
};
