// The id a build names itself by (D9): the episode id of the build's own
// traced episode when it runs in one, so one id names the build in its trace
// and everywhere else; otherwise a fresh `build.<uuid>`, as every build was
// named before tracing. Read where the service mints the build id, in place
// of the expression that minted it.

import { randomUUID } from "node:crypto";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";

/** The calling build's episode id, or a fresh `build.<uuid>` outside a traced build (a repair build inside a run takes a fresh one). */
export function automationStudioGatewayTraceBuildId(): string {
  const open = AutomationStudioGatewayTraceInstallation.current()?.current();
  if (open !== undefined && open.activity === "exploration" && open.episodeId.startsWith("build.")) return open.episodeId;
  return `build.${randomUUID()}`;
}
