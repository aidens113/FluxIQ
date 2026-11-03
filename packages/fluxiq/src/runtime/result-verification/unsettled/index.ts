// What a verification two checks did not settle closes with, as a run and as
// a build read it. Its own directory so the build's endings
// (`../../flow-bootstrap/unfinished-build/not-done.ts`) can read it without
// loading this whole directory, which reads theirs through its barrel.
export * from "./unsettled-words.ts";
