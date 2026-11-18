/**
 * Whether a project or category stored under `storedDomainId` is in view of a
 * request working in `scopeDomainId`, on an instance whose host serves
 * `instanceDomainId` (`FluxIQ.activeDomainId`, bound into Automation Studio
 * with its IO runtime; null when the instance serves no domain). It decides
 * the project list and the domain gate (`assertProjectDomainAccess`), nothing
 * else: a project stored with no domain is still a global project, and its
 * Flows still have the global scope (`flowScopeForProject`).
 *
 * On an instance that serves a domain, that domain and "no domain" are one
 * view for the person: its global projects are listed beside the domain's,
 * and a request naming no domain reaches the domain's projects. Without this,
 * one person saw two disjoint sets of projects and chats: a paired client is
 * bound to the instance's domain, while the panel's routes that name none
 * (and every project the panel made before t915) were a partition of their
 * own (t915, D1/D2). Another named domain stays its own surface, so a client
 * bound to it still cannot reach this one's projects, and on an instance that
 * serves no domain nothing changes.
 *
 * This is the domain gate only. Who may read a project is still IAM's
 * decision per person, and another tenant's projects live in another
 * instance's store.
 */
export function projectDomainMatches(storedDomainId: string | null | undefined, scopeDomainId: string | null | undefined, instanceDomainId: string | null): boolean {
  return (storedDomainId ?? instanceDomainId) === (scopeDomainId ?? instanceDomainId);
}
