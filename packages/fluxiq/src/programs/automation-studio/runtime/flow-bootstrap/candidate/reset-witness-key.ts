// The Flow node metadata key a lasting step's reset witness stamp is written
// under (t751, R3 door 2): the plan node's Core-derived `resetWitness`
// (`../plan/contracts.ts`) is stamped there when the plan becomes a Flow
// (`../adaptation.ts`), and each act a trial of that node lands takes it from
// there (`../../service/candidate-trial/landed-acts.ts`), validated again by
// `automationStudioSiteResetWitnessStampValid`.

/** The Flow node metadata key of a step's reset witness stamp (header). */
export const AUTOMATION_STUDIO_RESET_WITNESS_METADATA_KEY = "resetWitness";
