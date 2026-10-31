/** Optional client-authored operation advice in fixed Core-owned positions. */
export type AutomationStudioFlowScriptGuidance = {
  readonly version: string;
  readonly act?: {
    readonly controlOperations?: readonly string[];
  };
};
