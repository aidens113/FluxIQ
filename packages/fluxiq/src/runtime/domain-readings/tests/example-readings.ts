import type { AutomationStudioControlWordsReader } from "../../../framework/automation-service/nodes/index.ts";
import { exampleActivityControlReader } from "../../automation-activity/wording/tests/example-control.ts";
import type { AutomationStudioDomainReadings } from "../index.ts";

const FIELDS = ["accessibleName", "visibleText", "label", "placeholder"];
const fields = (value: unknown): Readonly<Record<string, unknown>> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
const strings = (identity: Readonly<Record<string, unknown>> | undefined, names: readonly string[]): string[] => identity ? names.map((name) => identity[name]).filter((value): value is string => typeof value === "string") : [];

/** A domain's reading of a control's words, in the shape Core's tests have always written. A real domain's is tested in that domain. */
export const exampleControlWordsReader: AutomationStudioControlWordsReader = (parameters) => {
  const element = fields(parameters?.element);
  const target = fields(parameters?.target);
  const fingerprint = fields(target?.fingerprint);
  const flat = target && !fingerprint ? target : undefined;
  if (!element && !target) return undefined;
  return { words: [...strings(element, FIELDS), ...strings(fingerprint, FIELDS), ...strings(flat, [...FIELDS, "name"])], readsItsWords: element?.readsWords === true };
};

/**
 * The readings a test of what Core says about a control takes, by mocking the one
 * function that asks:
 *
 *   vi.mock("<domain-readings>/scope.ts", async (original) => ({
 *     ...(await original<object>()),
 *     automationStudioDomainReadings: () => (await import("<domain-readings>/tests/example-readings.ts")).exampleDomainReadings
 *   }));
 */
export const exampleDomainReadings: Readonly<AutomationStudioDomainReadings> = { activityControlReader: exampleActivityControlReader, controlWordsReader: exampleControlWordsReader };
