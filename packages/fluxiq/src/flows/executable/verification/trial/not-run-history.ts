/** Historical diagnostic data; the producer view remains stricter. */

export type TrialNotRunHistory = { nodeId: string; label?: string; reason: "guarded" | "unreached"; after?: string; passes: number[] | "every"; of?: number };
