import { AUTOMATION_STUDIO_PROGRAM } from "../automation-studio/metadata.ts";
import { BACKGROUND_TASKS_PROGRAM } from "../background-tasks/metadata.ts";
import { COMPUTE_CONTROL_PROGRAM } from "../compute-control/metadata.ts";
import { DATABASE_MANAGER_PROGRAM } from "../database-manager/metadata.ts";
import { DEPLOYMENT_SYNC_PROGRAM } from "../deployment-sync/metadata.ts";
import { DOCS_PROGRAM } from "../docs/metadata.ts";
import { IDENTITY_ACCESS_PROGRAM } from "../identity-access/metadata.ts";
import { PRODUCTION_RUNNER_PROGRAM } from "../production-runner/metadata.ts";
import type { GlobalProgramDefinition, ProgramDirectory, ProgramScope, ProgramSummary } from "./types.ts";

export const GLOBAL_PROGRAMS: GlobalProgramDefinition[] = [
  AUTOMATION_STUDIO_PROGRAM,
  IDENTITY_ACCESS_PROGRAM,
  DATABASE_MANAGER_PROGRAM,
  BACKGROUND_TASKS_PROGRAM,
  COMPUTE_CONTROL_PROGRAM,
  DEPLOYMENT_SYNC_PROGRAM,
  DOCS_PROGRAM,
  PRODUCTION_RUNNER_PROGRAM
];

export function defaultGlobalProgramCatalog(scope: ProgramScope = {}): ProgramSummary[] {
  const routePrefix = scope.domainId ? `/domains/${scope.domainId}/programs` : "/programs";
  const scopeName = scope.domainId ? "domain" : "global";
  const category = scope.domainId ? "Domain Control" : "Framework Control";

  return GLOBAL_PROGRAMS.map((program) => ({
    ...program,
    category: program.category === "Framework Control" ? category : program.category,
    route: `${routePrefix}/${program.id}`,
    scope: scopeName,
    globalProgram: true
  }));
}

export const defaultProgramCatalog = defaultGlobalProgramCatalog;

export function buildProgramDirectory(params: {
  scope?: ProgramScope;
  domains?: ProgramDirectory["domains"];
  domain?: ProgramDirectory["domain"];
  domainProgramRoot?: string;
}): ProgramDirectory {
  const scope = params.scope ?? {};
  const directory: ProgramDirectory = {
    scope,
    domains: params.domains ?? [],
    domain: params.domain ?? null,
    programs: defaultGlobalProgramCatalog(scope)
  };
  if (params.domainProgramRoot) {
    directory.domainProgramRoot = params.domainProgramRoot;
  }
  return directory;
}
