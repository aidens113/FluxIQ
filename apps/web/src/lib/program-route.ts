// The program route's paired-client allowlist, narrowing and actor live in
// Core (`fluxiq/server`, `server/program-route/program-route.ts`), so a server
// without Next.js holds a paired client to exactly the same rules. The routes
// that accept a paired client's token import them from here.
export {
  isPairedClientClassification,
  isPairedClientEndpoint,
  narrowPairedClientRequest,
  PAIRED_CLIENT_ENDPOINTS,
  pairedClientActor,
  pairedClientDomainScope,
  pairedClientProjectTarget,
  programDomainScope,
  programResponseStatus,
  projectPairedClientResponse,
  readBearerToken,
  withProgramAuthSession,
} from "fluxiq/server";
export type { PairedClientProjectTarget, PairedClientRequestNarrowing } from "fluxiq/server";
