/** Keep cleanup ordered, drain every owner, and report every failed close. */
export async function closeAutomationStudioRuntimeResources(closers: readonly (() => unknown | Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const close of closers) {
    try { await close(); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "automation_studio.close_failed");
}
