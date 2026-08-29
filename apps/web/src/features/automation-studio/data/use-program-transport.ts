"use client";

import { useProgramApi } from "../../programs/program-api";
import type { ProgramCommandTransport } from "./program-transport";

export function useProgramTransport(programId: string): ProgramCommandTransport {
  return useProgramApi(programId);
}