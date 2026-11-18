// Types for `next.config.ts`, which imports this JavaScript module.

export declare function assertOneCoreGraph(build: { distDirectory: string; coreDirectory: string }): Promise<{ files: number; bundled: number }>;
export declare function coreExportSignatures(coreDirectory: string): Promise<Map<string, string>>;
export declare function coreModuleCopies(serverDirectory: string, signatures: Map<string, string>): Promise<{ files: number; registrations: number; copies: Map<string, Map<string, string[]>> }>;
