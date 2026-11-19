// The V8 old-space size, in MB, that `next build` runs with. Next type-checks
// the whole panel in a worker process, and Node's default limit (about 2 GB)
// aborts it with "JavaScript heap out of memory" (exit 134). The Docker image
// build gets this value through the same launcher (`run-next-build.mjs`), so
// the two cannot drift. Keep it under the build machine's memory.
export const BUILD_HEAP_MB = 3584;
