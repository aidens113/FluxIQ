import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";

type Ports = {
  list(input: { projectId: string; flowId: string; status: "active"; limit: number; offset: number }): Promise<{ instructions: Array<{ instructionId: string }>; total: number }>;
  get(projectId: string, instructionId: string): Promise<AutomationStudioFlowInstruction | null>;
};

/** Owner enumeration before filtering. Strict reads are snapshots, not pinned authority. */
export class AutomationStudioBootstrapInstructionInventory {
  constructor(private readonly ports: Ports) {}
  async read(projectId: string, flowId: string, strict = false): Promise<{ instructions: AutomationStudioFlowInstruction[]; instructionIds: string[] }> {
    const ids = new Set<string>();
    let total: number | undefined;
    for (let offset = 0; ; offset += 100) {
      const page = await this.ports.list({ projectId, flowId, status: "active", limit: 100, offset });
      if (strict && (!Number.isSafeInteger(page.total) || page.total < 0 || total !== undefined && page.total !== total)) throw new Error("candidate_sources.inventory_changed");
      total ??= page.total;
      for (const row of page.instructions) {
        if (strict && (typeof row.instructionId !== "string" || !row.instructionId || ids.has(row.instructionId))) throw new Error("candidate_sources.inventory_duplicate_or_invalid");
        ids.add(row.instructionId);
      }
      if (offset + page.instructions.length >= page.total || page.instructions.length === 0) break;
      if (strict && page.instructions.length !== 100) throw new Error("candidate_sources.inventory_incomplete");
    }
    const instructionIds = [...ids].sort();
    if (strict && instructionIds.length !== total) throw new Error("candidate_sources.inventory_incomplete");
    const read = await Promise.all(instructionIds.map(async id => {
      const original = await this.ports.get(projectId, id);
      if (strict && (!original || original.instructionId !== id || original.status !== "active")) throw new Error("candidate_sources.original_missing_or_changed");
      return original ? structuredClone(original) : null;
    }));
    return { instructionIds, instructions: read.filter((instruction): instruction is AutomationStudioFlowInstruction => instruction?.status === "active") };
  }
}
