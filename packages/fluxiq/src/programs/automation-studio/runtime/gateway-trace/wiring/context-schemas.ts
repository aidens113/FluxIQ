// The schemas of the context each kind of episode records in its trace's
// manifest (D9): what a build was asked, what a run was given, which candidate
// or subflow proposal a trial ran. The value is the program's own, read from
// what Core already stored, and screened before it is stored (D15).
export const AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT = Object.freeze({
  build: Object.freeze({ name: "automation-studio.build-context", version: "1" }),
  run: Object.freeze({ name: "automation-studio.run-context", version: "1" }),
  candidateTrial: Object.freeze({ name: "automation-studio.candidate-trial-context", version: "1" }),
  subflowTrial: Object.freeze({ name: "automation-studio.subflow-trial-context", version: "1" })
});
