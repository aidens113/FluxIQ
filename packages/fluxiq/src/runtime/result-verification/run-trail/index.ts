// What every judge is shown of how a result was got (t963): the one builder (`./trail.ts`), its reading
// (`./note.ts`), its three sources -- an attempt's calls, a finished run's traced attempts, a build test's
// observations -- and the shorter forms of a run's or a trial's summary that keep it (`./fitting.ts`).
export { AUTOMATION_STUDIO_RESULT_TRAIL_NOTE } from "./note.ts";
export { automationStudioResultRunTrail } from "./trail.ts";
export { automationStudioResultTrailSemanticStep, automationStudioResultSemanticTrail, type AutomationStudioResultTrailSemanticOptions } from "./semantic/index.ts";
export { automationStudioResultTrailRepeatsOnce } from "./repeats.ts";
export { automationStudioResultTrailScreened } from "./screen.ts";
export { automationStudioResultTrailOfAttempts, automationStudioResultTrailOfObservations, automationStudioResultTrailStepOfCall } from "./of/index.ts";
export { automationStudioResultTrailFitting } from "./fitting.ts";
export { AUTOMATION_STUDIO_RESULT_SIZE_REFUSED, automationStudioResultSummaryFormForWindow } from "./window.ts";
