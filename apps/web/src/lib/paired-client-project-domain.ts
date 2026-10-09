// Whether a paired client's token may reach a project: only when the project's
// domain is the one its pairing bound (t379). Every route that accepts the
// token -- the program route, the state-asset upload, the recordings list --
// asks here, so the gate and the sentence a refused client shows are one.

/** The code a refused call carries, so a client can tell it from a refused token. */
export const PAIRED_CLIENT_PROJECT_DOMAIN_ERROR_CODE = "authorization.project_domain";

type ProjectDomainCheck = {
  assertProjectDomainAccess(projectId: string, domainId?: string | null): Promise<void>;
};

export type PairedClientProjectDomainRefusal = {
  ok: false;
  errorCode: typeof PAIRED_CLIENT_PROJECT_DOMAIN_ERROR_CODE;
  error: string;
};

/**
 * Null when `projectId` is in `domainId`; otherwise the refusal to answer with.
 * A project that does not exist is refused the same way, so the answer says
 * nothing about which ids exist elsewhere.
 */
export async function pairedClientProjectDomainRefusal(
  automationStudio: ProjectDomainCheck,
  projectId: string,
  domainId: string | null,
): Promise<PairedClientProjectDomainRefusal | null> {
  try {
    await automationStudio.assertProjectDomainAccess(projectId, domainId);
    return null;
  } catch {
    return { ok: false, errorCode: PAIRED_CLIENT_PROJECT_DOMAIN_ERROR_CODE, error: projectDomainSentence(domainId) };
  }
}

// Plain words a person can act on: which kind of project this browser is
// paired for, and what to do. The domain id is the client's own declaration,
// never a secret.
function projectDomainSentence(domainId: string | null): string {
  if (domainId === null) return "This browser was paired for projects without a domain, and this project has one. Open a project without a domain in FluxIQ, then try again.";
  const kind = domainId.replace(/[-_.]+/g, " ").trim();
  return `This browser was paired for ${kind} projects, and this project is not one. Open a ${kind} project in FluxIQ, then try again.`;
}
