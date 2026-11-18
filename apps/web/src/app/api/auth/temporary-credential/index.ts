// Barrel for the temporary first-run credential (`admin`/`admin` on the local
// profile) on the server. Proving it opens no panel session: it opens only a
// setup grant, held in an HttpOnly cookie, that `/api/auth/credential-setup`
// spends to replace the password and sign the person in. Every other route
// checks a panel session, which this credential never gets.
export { beginCredentialSetup } from "./begin-credential-setup";
export { credentialSetupCookies } from "./credential-setup-cookies";
export { credentialSetupGrants, type CredentialSetupGrant } from "./credential-setup-grants";
export { isLoopbackRequest } from "./is-loopback-request";
export { isTemporaryCredential } from "./is-temporary-credential";
export { replaceTemporaryCredential, type TemporaryCredentialReplacement } from "./replace-temporary-credential";
export { TEMPORARY_CREDENTIAL } from "./temporary-credential";
