import type { AutomationStudioRuntimeBundle } from "./bundle.ts";
import type { AutomationStudioRuntimeIo } from "./io.ts";

/** Selection metadata is immutable; the trusted implementation objects retain their identity. */
export type AutomationStudioRuntimeView = Readonly<Omit<AutomationStudioRuntimeBundle, "runtime" | "domainId"> & {
  runtime?: string | undefined;
  domainId: string | null;
  io?: AutomationStudioRuntimeIo | undefined;
}>;
