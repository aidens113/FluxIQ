export type AutomationStudioResourcePage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AutomationStudioResourceDelta<TItem> =
  | { operation: "upsert"; item: TItem }
  | { operation: "delete"; id: string };

export class AutomationStudioResourcePageStore<TItem> {
  private readonly pages = new Map<string, AutomationStudioResourcePage<TItem>>();

  constructor(private readonly idOf: (item: TItem) => string) {}

  setPage(queryKey: string, page: AutomationStudioResourcePage<TItem>): void {
    this.pages.set(queryKey, { ...page, items: dedupe(page.items, this.idOf) });
  }

  getPage(queryKey: string): AutomationStudioResourcePage<TItem> | undefined {
    const page = this.pages.get(queryKey);
    return page ? { ...page, items: [...page.items] } : undefined;
  }

  applyDelta(delta: AutomationStudioResourceDelta<TItem>): void {
    for (const [queryKey, page] of this.pages) {
      const nextItems = delta.operation === "delete"
        ? page.items.filter((item) => this.idOf(item) !== delta.id)
        : dedupe([delta.item, ...page.items], this.idOf);
      this.pages.set(queryKey, { ...page, items: nextItems });
    }
  }

  invalidate(queryKey: string): void { this.pages.delete(queryKey); }
  clear(): void { this.pages.clear(); }
}

export function automationStudioResourcePageKey(input: Record<string, string | number | boolean | null | undefined>): string {
  return Object.entries(input)
    .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value === null ? "null" : String(value)}`)
    .join("|");
}

function dedupe<TItem>(items: TItem[], idOf: (item: TItem) => string): TItem[] {
  const seen = new Set<string>();
  const result: TItem[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}
