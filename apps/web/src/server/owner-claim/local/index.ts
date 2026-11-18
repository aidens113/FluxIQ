// Barrel for the owner claim on the `local` profile. No account has a password
// anyone knows: at start the panel prints a one-time setup link
// (`http://127.0.0.1:<port>/setup#<code>`), and the person who opens it chooses
// their name and password and is signed in. An install whose default admin is
// still on the temporary password gets a link too, and that admin's sessions
// are ended at every start until it is replaced.
export { claimLocalOwner } from "./claim-owner";
export { localSetupCode } from "./setup-code";
export { prepareLocalFirstRun } from "./prepare-first-run";
export type * from "./types";
