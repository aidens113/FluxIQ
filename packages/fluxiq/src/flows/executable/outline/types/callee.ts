import type { ProjectPartStep } from "../../../../api-contracts/automation/index.ts";

/** What a Flow called by a step is, as far as the caller knows it. */
export type OutlineCallee = { name: string; lastingClasses?: ProjectPartStep["lastingClasses"] };
