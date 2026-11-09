// Whether a paired client's token may reach a project: only when the project's
// domain is the one its pairing bound (t379). The gate lives in Core
// (`fluxiq/server`) beside the program route that uses it; the other routes
// that accept the token import it from here.
export { PAIRED_CLIENT_PROJECT_DOMAIN_ERROR_CODE, pairedClientProjectDomainRefusal } from "fluxiq/server";
export type { PairedClientProjectDomainRefusal } from "fluxiq/server";
