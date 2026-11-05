// What a guard is given and what it answers. The page is read before the guard is
// asked, so the guard itself reads nothing and can be tried on every case.
import type { AutomationStudioAttemptActClass, AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFactTruth } from "../../automation-host/contracts/index.ts";
import type { AutomationStudioPartSnapshot } from "../card/index.ts";

/** Who is asking: a person answers `part.confirm_repeat`; a build never repeats a lasting act, so it is not asked that. */
export type AutomationStudioPartCaller = "person" | "build";

/** What was asked of the run. Absent classes permit nothing lasting. */
export type AutomationStudioPartAsked = {
  caller: AutomationStudioPartCaller;
  inputs: Readonly<Record<string, JsonValue>>;
  permittedConsequences?: readonly string[] | undefined;
  acknowledgedRepeat?: boolean | undefined;
};

/** The page as it stands. `origin` is undefined when it could not be read; `startFacts` answers the snapshot's start conditions by position. */
export type AutomationStudioPartPageRead = {
  origin: string | undefined;
  startFacts: readonly AutomationStudioFactTruth[];
};

export type AutomationStudioPartGuardInput = {
  card: Pick<AutomationStudioSubflowCard, "sites" | "inputs" | "lastingClasses"> | undefined;
  snapshot: Pick<AutomationStudioPartSnapshot, "start" | "graph"> | undefined;
  asked: AutomationStudioPartAsked;
  page: AutomationStudioPartPageRead;
};

/** Every way a guard refuses. Closed. */
export type AutomationStudioPartGuardCode =
  | "part.not_found"
  | "part.wrong_site"
  | "part.not_at_start"
  | "part.input_missing"
  | "part.input_unknown"
  | "part.act_not_allowed"
  | "part.confirm_repeat";

export type AutomationStudioPartGuardAnswer =
  | { ok: true }
  | { refused: AutomationStudioPartGuardCode; message: string; classes?: AutomationStudioAttemptActClass[] };
