"use client";

import { createContext, useContext } from "react";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import type { FlowSummary, OutlinePort, StepEdit } from "../../wire";

/** What every step of the list can do, given once by the editor rather than passed down each level. */
export type StepActions = {
  studio: ProgramCommandTransport;
  flow: { projectId: string; flowId: string };
  /** The Flow's inputs, for binding a value to one. */
  needs: readonly OutlinePort[];
  /** Sends one change. `at` names where it was made (a step's key, or "append"), so a refusal shows there. Resolves true when saved. */
  edit(edit: StepEdit, at: string): Promise<boolean>;
  /** True while a change is being saved: every control that changes the Flow waits. */
  busy: boolean;
  /** Why the last change was refused, at the place it was made. */
  refusal?: { at: string; reason: string };
  /** Step keys the person picked for the assistant. */
  selected: ReadonlySet<string>;
  toggleSelected(key: string): void;
  /** The project's other Flows, for "Run another Flow"; loaded the first time it is asked for. */
  otherFlows(): Promise<FlowSummary[]>;
};

export const StepActionsHandle = createContext<StepActions | null>(null);

export function useStepActions(): StepActions {
  const actions = useContext(StepActionsHandle);
  if (!actions) throw new Error("useStepActions needs the Flow editor above it.");
  return actions;
}
