import { IAM_PROGRAM_SERVICE_PREFIXES, type IamService } from "@fluxiq/contracts/iam";
import { IAM_OPERATOR_PROGRAMS } from "./operator-programs.ts";

/** The service prefix a program's endpoints are generated under; throws for an unknown program. */
export function iamProgramService(programId: string): IamService {
  const named = Object.hasOwn(IAM_PROGRAM_SERVICE_PREFIXES, programId) ? IAM_PROGRAM_SERVICE_PREFIXES[programId] : undefined;
  if (named !== undefined) return named;
  if (IAM_OPERATOR_PROGRAMS.includes(programId)) return "ops";
  throw new TypeError(`Program ${JSON.stringify(programId)} has no IAM service; add it to IAM_OPERATOR_PROGRAMS or the contract prefixes.`);
}
