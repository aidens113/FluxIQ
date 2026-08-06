import type { DomainSummary } from "../../domains/index.ts";
import type { FluxIQIconName } from "../../ui/index.ts";

export type ProgramScope = {
  domainId?: string | null;
};

export type ProgramStatus = "available" | "preview";

export type ProgramSummary = {
  id: string;
  title: string;
  category: string;
  description: string;
  route: string;
  icon: FluxIQIconName;
  status: ProgramStatus;
  scope: "global" | "domain";
  globalProgram: boolean;
};

export type GlobalProgramDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: FluxIQIconName;
  status: ProgramStatus;
};

export type ProgramDirectory = {
  scope: ProgramScope;
  domains: DomainSummary[];
  domain: DomainSummary | null;
  programs: ProgramSummary[];
  domainProgramRoot?: string;
};
