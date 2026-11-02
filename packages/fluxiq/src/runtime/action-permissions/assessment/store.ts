import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioActionAssessmentScope } from "../../../flows/executable/permissions/index.ts";
type Frame = Readonly<{ scope: AutomationStudioActionAssessmentScope; parent: Frame | undefined }>;
const STORE = Symbol.for("fluxiq.automation-studio.action-assessments.v1");
type Store = AsyncLocalStorage<Frame>;
const holder = globalThis as typeof globalThis & { [STORE]?: Store };
/** The original cross-bundle store; the compatibility owner imports this same authority. */
export const actionAssessmentFrames: Store = holder[STORE] ??= new AsyncLocalStorage<Frame>();
