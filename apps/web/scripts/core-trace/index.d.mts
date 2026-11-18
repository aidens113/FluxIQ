// Types for `next.config.ts`, which imports this JavaScript module.

export declare function assertCoreTraced(build: { distDirectory: string; webDirectory: string; modules?: string[] }): Promise<{ requests: number; traced: number }>;
export declare function coreRequests(serverDirectory: string, modules?: string[]): Promise<Map<string, string[]>>;
export declare function tracedFiles(serverDirectory: string): Promise<{ traces: number; files: Set<string> }>;
export declare function normalise(file: string): string;
