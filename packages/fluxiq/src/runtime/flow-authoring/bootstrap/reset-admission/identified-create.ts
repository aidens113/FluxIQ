// What an identified reversible creation is about (t748, t751): exactly
// create_new, about its control's subject, or its page where the control sits
// in no item. Such a creation is witnessed only by an original of its
// destination with its subject absent there, or by a witnessed explored act it
// repeats (`./admission.ts`, rule 4); its subjects are what that original must
// not hold (`../site-reset/create-baselines.ts`, `destination`). Pure.

import type { AutomationStudioSiteResetAdmissionDeclared } from "./contracts.ts";

/** The subjects an identified reversible creation is about, or none where the creation rule does not apply (header). */
export function automationStudioSiteResetIdentifiedCreate(declared: AutomationStudioSiteResetAdmissionDeclared): string[] | undefined {
  const { control, consequences } = declared;
  const subjects = [...new Set([control.subject, ...(control.item === undefined ? [control.page] : [])].filter((subject): subject is string => subject !== undefined))];
  return declared.effect !== "mutate" || consequences.length !== 1 || consequences[0] !== "create_new" || subjects.length === 0 ? undefined : subjects;
}
