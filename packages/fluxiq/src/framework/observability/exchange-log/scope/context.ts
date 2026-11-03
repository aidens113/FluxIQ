import type { AutomationStudioLlmStepLogPhase } from "./phase.ts";
import type { AutomationStudioLlmStepLogPart } from "./part.ts";
import type { AutomationStudioLlmStepLogPass } from "./pass.ts";
import type { AutomationStudioLlmStepLogAgent } from "./agent.ts";


/** The part, round and phase every step made inside a scope is written with, the agent that made it, and the pass a test's call is on. */
export type AutomationStudioLlmStepLogContext = {
  round?: number;
  phase?: AutomationStudioLlmStepLogPhase;
  part?: AutomationStudioLlmStepLogPart;
  pass?: AutomationStudioLlmStepLogPass;
  role?: AutomationStudioLlmStepLogAgent["role"];
  briefId?: string;
};
