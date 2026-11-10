import type { HomeRun } from "./types";

/** How long a finished run took, in plain words; undefined while it has not finished. */
export function runDuration(run: Pick<HomeRun, "startedAt" | "finishedAt">): string | undefined {
  if (run.finishedAt === undefined || run.finishedAt < run.startedAt) return undefined;
  const seconds = Math.round((run.finishedAt - run.startedAt) / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
