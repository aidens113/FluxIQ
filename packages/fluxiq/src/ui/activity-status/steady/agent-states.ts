// What each agent of a unit of work is in the middle of (t753). A project
// build's agents share one unit of work, and the state a row's headline is read
// from -- a test under way, a repair, the page being got ready, a run's step
// count -- is one agent's, not the unit's: one builder's tool row ended
// another's test, whose next step opened it again, and the headline alternated
// "Testing your Flow" and "Building your Flow" with every row. Each agent keeps
// its own; a row no agent says (a build with one agent, a saved Flow's run)
// keeps the unit's.
//
// A supervisor's card for a brief speaks of that brief, so it is read into the
// brief's own state: a reset's card makes its builder's rows read "Putting the
// site back". A new brief also ends a repair the unit's own rows were in.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { CandidateTrial } from "../candidate-trial.ts";
import { UnitSituation } from "../unit-situation.ts";
import { PagePreparation } from "./page-preparation.ts";
import { RunCount } from "./run-count.ts";

/** One agent's state within a unit of work. */
export type AgentState = {
  readonly situation: UnitSituation;
  readonly trial: CandidateTrial;
  readonly preparation: PagePreparation;
  readonly count: RunCount;
};

/** The unit's own key: rows no agent says. */
const UNIT = "";

/** Who says `event`: the agent's brief, else its role; the unit's own key for a row no agent says. */
export function activityAgentKey(event: ClientGatewayActivity): string {
  return event.agent ? (event.agent.briefId ?? event.agent.role) : UNIT;
}

/** Whose state `event` speaks of: a brief's card speaks of that brief, any other row of who says it. */
function stateKeyOf(event: ClientGatewayActivity): string {
  const card = event.detail?.kind === "note" ? event.detail.project : undefined;
  if (card?.kind === "brief" || card?.kind === "return") return card.briefId;
  return activityAgentKey(event);
}

export class AgentStates {
  private activityId: string | undefined;
  private readonly states = new Map<string, AgentState>();

  /** The state `event` is read into, made the first time its agent speaks; a new unit of work starts every agent afresh. */
  of(event: ClientGatewayActivity): AgentState {
    if (event.activityId !== this.activityId) {
      this.activityId = event.activityId;
      this.states.clear();
    }
    const key = stateKeyOf(event);
    if (key !== UNIT && event.detail?.kind === "note" && event.detail.project?.kind === "brief") this.states.get(UNIT)?.situation.endRepair();
    let state = this.states.get(key);
    if (state === undefined) {
      state = { situation: new UnitSituation(), trial: new CandidateTrial(), preparation: new PagePreparation(), count: new RunCount() };
      this.states.set(key, state);
    }
    return state;
  }
}
