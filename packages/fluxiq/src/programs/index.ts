import type { DomainSummary } from "../domains";

export type ProgramScope = {
  domainId?: string | null;
};

export type ProgramSummary = {
  id: string;
  title: string;
  category: string;
  description: string;
  route: string;
  icon: string;
  status: "available" | "preview";
  scope: "global" | "domain";
  globalProgram: boolean;
};

export type GlobalProgramDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  status: "available" | "preview";
};

export type ProgramDirectory = {
  scope: ProgramScope;
  domains: DomainSummary[];
  domain: DomainSummary | null;
  programs: ProgramSummary[];
  domainProgramRoot?: string;
};

export const GLOBAL_PROGRAMS: GlobalProgramDefinition[] = [
  {
    id: "automation-studio",
    title: "Automation Studio",
    category: "Authoring",
    description: "Create tasks, routines, interfaces, recordings, and generated policies.",
    icon: "blocks",
    status: "available"
  },
  {
    id: "flow-editor",
    title: "Flow Editor",
    category: "Authoring",
    description: "Create, inspect, validate, and run flow graphs using registered components.",
    icon: "workflow",
    status: "preview"
  },
  {
    id: "identity-access",
    title: "Identity & Access",
    category: "Framework Control",
    description: "Manage users, roles, sessions, high-impact action gates, and vault access.",
    icon: "shield-check",
    status: "preview"
  },
  {
    id: "data",
    title: "Data Management",
    category: "Framework Control",
    description: "Browse framework data stores, repositories, migrations, and domain-scoped records.",
    icon: "database",
    status: "preview"
  },
  {
    id: "compute",
    title: "Compute Control",
    category: "Framework Control",
    description: "Monitor compute nodes, dispatch flow runs, inspect leases, and coordinate workers.",
    icon: "git-branch",
    status: "preview"
  }
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
  domains?: DomainSummary[];
  domain?: DomainSummary | null;
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

export type ProgramApiRequest<TPayload = unknown> = {
  programId: string;
  endpoint: string;
  scope: ProgramScope;
  payload?: TPayload;
};

export type ProgramApiResponse<TPayload = unknown> = {
  ok: boolean;
  payload?: TPayload;
  error?: string;
};

export type ProgramApiHandler<TRequest = unknown, TResponse = unknown> = (
  request: ProgramApiRequest<TRequest>
) => Promise<ProgramApiResponse<TResponse>> | ProgramApiResponse<TResponse>;

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, ProgramApiHandler>();

  register(params: {
    programId: string;
    endpoint: string;
    handler: ProgramApiHandler;
  }): void {
    const key = apiKey(params.programId, params.endpoint);
    if (this.handlers.has(key)) {
      throw new Error(`Duplicate global program API handler: ${key}`);
    }
    if (!GLOBAL_PROGRAMS.some((program) => program.id === params.programId)) {
      throw new Error(`Unknown global program id: ${params.programId}`);
    }
    this.handlers.set(key, params.handler);
  }

  async call<TRequest = unknown, TResponse = unknown>(
    request: ProgramApiRequest<TRequest>
  ): Promise<ProgramApiResponse<TResponse>> {
    const handler = this.handlers.get(apiKey(request.programId, request.endpoint));
    if (!handler) {
      return { ok: false, error: `Global program API handler not found: ${request.programId}/${request.endpoint}` };
    }
    return handler(request) as Promise<ProgramApiResponse<TResponse>>;
  }

  endpoints(): Array<{ programId: string; endpoint: string }> {
    return [...this.handlers.keys()].map((key) => {
      const [programId = "", endpoint = ""] = key.split(":", 2);
      return { programId, endpoint };
    });
  }
}

function apiKey(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}:${endpoint.trim().toLowerCase()}`;
}
