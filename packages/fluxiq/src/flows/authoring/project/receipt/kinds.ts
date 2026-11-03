// A reference to a trial receipt. The receipt itself stays with its candidate
// owner; the build record holds only this. A `subflow_trial` is a partial
// receipt -- useful evidence, never credit toward promotion -- and only a
// `candidate_trial` of a whole candidate can be.

export const AUTOMATION_STUDIO_PROJECT_RECEIPT_KINDS = Object.freeze(["subflow_trial", "candidate_trial"] as const);
