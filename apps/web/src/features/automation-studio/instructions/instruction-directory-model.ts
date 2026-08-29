const WORKBENCH_PAGE_SIZE = 25;

export type InstructionDirectoryState = { search: string; status: string; scopeKind: string; requirement: string; sort: "updated" | "title" | "status" | "scope" | "priority"; direction: "asc" | "desc"; limit: number; offset: number };

export function readInstructionDirectoryUrlState(input: Partial<InstructionDirectoryState> = {}): InstructionDirectoryState {

  const limit = input.limit !== undefined && [10, 25, 50].includes(input.limit) ? input.limit : WORKBENCH_PAGE_SIZE;
  const sort = input.sort;
  return {
    search: input.search ?? "", status: input.status ?? "", scopeKind: input.scopeKind ?? "", requirement: input.requirement ?? "",
    sort: sort === "title" || sort === "status" || sort === "scope" || sort === "priority" ? sort : "updated",
    direction: input.direction === "asc" ? "asc" : "desc", limit, offset: Math.max(0, Number(input.offset) || 0)
  };
}
