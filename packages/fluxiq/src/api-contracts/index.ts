import { z } from "zod";

export const programScopeSchema = z.object({
  domainId: z.string().min(1).nullable().optional()
});

export const programSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string(),
  route: z.string().min(1),
  icon: z.string().min(1),
  status: z.enum(["available", "preview"]),
  scope: z.enum(["global", "domain"]),
  globalProgram: z.boolean()
});

export const domainSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string(),
  route: z.string().min(1),
  icon: z.string().min(1),
  status: z.enum(["available", "preview", "disabled"]),
  capabilities: z.array(z.string()).optional()
});

export const programDirectorySchema = z.object({
  scope: programScopeSchema,
  domains: z.array(domainSummarySchema),
  domain: domainSummarySchema.nullable(),
  programs: z.array(programSummarySchema),
  domainProgramRoot: z.string().optional()
});

export type ProgramScopeContract = z.infer<typeof programScopeSchema>;
export type ProgramSummaryContract = z.infer<typeof programSummarySchema>;
export type DomainSummaryContract = z.infer<typeof domainSummarySchema>;
export type ProgramDirectoryContract = z.infer<typeof programDirectorySchema>;
