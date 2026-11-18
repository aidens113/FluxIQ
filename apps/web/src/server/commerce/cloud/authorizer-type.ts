import type { CloudAdmissionOptions } from "fluxiq/platform";

/** The server's IAM target resolver, as cloud admission takes it. */
export type CloudAuthorizer = CloudAdmissionOptions<unknown>["authorize"];
