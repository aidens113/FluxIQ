// The bounds on what a domain may keep through its build state (`./store.ts`).
// A domain writes these values from inside a build, on every call if it likes,
// so each is bounded where it is written rather than trusted to stay small.

export const AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS = Object.freeze({
  /** Serialized bytes of one value. */
  maxValueBytes: 64 * 1024,
  /** Serialized bytes of every value in one scope together. */
  maxScopeBytes: 256 * 1024,
  /** Keys in one scope. */
  maxKeysPerScope: 64,
  /** Build scopes kept per domain and Flow; the one written longest ago goes first. */
  maxBuildsPerFlow: 16,
  /** A key: a plain name, as a domain names its own memory. */
  key: /^[A-Za-z0-9._:-]{1,120}$/u,
  /** A domain, project, Flow or build id, as Core's other stores accept them. */
  id: /^[A-Za-z0-9._:-]{1,200}$/u
});
