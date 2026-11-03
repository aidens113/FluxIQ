import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioActivityControlReader, AutomationStudioControlWordsReader } from "../../framework/automation-service/nodes/index.ts";

// The bound domain's readings of a node's parameters, for the unit of work
// reading them. They are its implementation bundle's hooks, and they travel in
// the async context because the words are asked for far below anything that
// knows a domain: by the executor, a state route, a script check, a trial's
// feedback and a result's check.
//
// **Each unit of work holds exactly its own domain's.** `run` replaces what is
// in scope and never falls back to it, so work entered for a domain with no
// readings reads none, even when started from inside another's. Nothing is
// registered and nothing outlives the work: this is a value in one async
// context, as the activity presentation beside it is
// (`../activity/presentation/scope.ts`). Two runs cannot see each other's.
//
// **With none in scope a reader answers nothing, never a guess.** Each consumer
// says what nothing means for it, and it is always the closed side: the model
// is told no name, a card says its verb alone, a finding that needs the words is
// not said, and a legacy step that may name a lasting act is read as one.

/** What a unit of work may read a node's parameters with. */
export type AutomationStudioDomainReadings = {
  activityControlReader?: AutomationStudioActivityControlReader | undefined;
  controlWordsReader?: AutomationStudioControlWordsReader | undefined;
};

const storage = new AsyncLocalStorage<Readonly<AutomationStudioDomainReadings>>();

/** Runs `fn` as work of a domain with these readings, in place of whatever `fn` was started under. An empty object is a domain with none. */
export function runWithAutomationStudioDomainReadings<T>(readings: Readonly<AutomationStudioDomainReadings>, fn: () => T): T {
  return storage.run(readings, fn);
}

/** The readings of the domain this work belongs to; undefined when no domain's work entered any. */
export function automationStudioDomainReadings(): Readonly<AutomationStudioDomainReadings> | undefined {
  return storage.getStore();
}
