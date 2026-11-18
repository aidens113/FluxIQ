/**
 * The base image a Dockerfile builds from by default (`ARG NODE_IMAGE=...`),
 * so `up` can record it as pulled when the build had to fetch it. Answers
 * null when the Dockerfile declares no such default.
 */
export function readBaseImage(dockerfile: string): string | null {
  const match = /^ARG\s+NODE_IMAGE=(\S+)\s*$/mu.exec(dockerfile);
  return match?.[1] ?? null;
}
