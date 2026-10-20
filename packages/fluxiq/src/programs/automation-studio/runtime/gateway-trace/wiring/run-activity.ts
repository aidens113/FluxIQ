// A normal run as one traced episode (D9): activity `execution`, its episode
// id the run's own id. The id is known only once the run's session is
// admitted, part way through the run, so the run's activity scope enters a
// pending frame here and `./run-bind.ts` names it at the point the activity
// scope is named. Wraps the run activity scope the service's run entry used
// directly, with its signature unchanged.
//
// Nothing installed: exactly the activity scope.

import { withAutomationStudioRunActivity } from "../../activity/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";

type RunSettled = { status: string; metadata?: unknown; trace?: unknown };

/** Runs one Flow run in its activity scope and, when tracing is installed, in a pending traced frame the run names at admission. */
export async function withAutomationStudioGatewayTraceRunActivity<T extends RunSettled>(
  target: { projectId?: string | null | undefined; flowId?: string | undefined },
  fn: () => Promise<T>,
  options?: Parameters<typeof withAutomationStudioRunActivity<T>>[2]
): Promise<T> {
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  const work = episodes === undefined || !target.projectId ? fn : () => episodes.runPending(fn);
  return await withAutomationStudioRunActivity(target, work, options);
}
