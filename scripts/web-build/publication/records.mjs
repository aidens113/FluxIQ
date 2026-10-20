// The names and shapes of the records that make a keyed web build reusable.

export const RECORDS = Object.freeze({
  /** In the key directory: names the one completed attempt the key serves. */
  publication: "published.json",
  /** In an attempt directory: written only after `next build` exited 0 and every check passed. */
  completion: "build-complete.json",
  schemaVersion: 1,
  maxBytes: 4_096,
  attemptName: /^b-[0-9a-f]{12}$/u,
  buildId: /^[A-Za-z0-9_-]{1,128}$/u
});
