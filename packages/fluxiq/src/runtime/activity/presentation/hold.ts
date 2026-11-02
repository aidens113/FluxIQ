import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export async function automationStudioActivityHold<T>(held: Promise<T>, ...args: unknown[]): Promise<T> {
  const value = invokeRuntimeActivityPresentation("automationStudioActivityHold", [held, ...args]);
  if (value !== undefined) void Promise.resolve(value).catch(/* best-effort: optional display completion has no authority over the held execution outcome. */ () => undefined);
  return await held;
}
