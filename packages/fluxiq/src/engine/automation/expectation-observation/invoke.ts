import type { AutomationNodeExpectationEvaluator } from "../../../components/automation/index.ts";
import type { ExecutionCallbackCall } from "../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { invokeAutomationCallback } from "../execution-admission/kernel/callback/index.ts";
import { AutomationExpectationDiagnostics } from "./companion/index.ts";

type EvaluationCall<TReceiver> = ExecutionCallbackCall<TReceiver, Parameters<AutomationNodeExpectationEvaluator>, ReturnType<AutomationNodeExpectationEvaluator>>;

/** Observes the engine's original evaluator call without replacing its host, method or tuple. */
export function invokeAutomationExpectation<TReceiver>(options: AutomationStudioGraphExecutionOptions, call: EvaluationCall<TReceiver>): Promise<Awaited<ReturnType<AutomationNodeExpectationEvaluator>>> {
  if (!AutomationExpectationDiagnostics.has(options) || !call.args[3].attemptId) return invokeAutomationCallback(options, call);
  return observe(options, call);
}

async function observe<TReceiver>(options: AutomationStudioGraphExecutionOptions, call: EvaluationCall<TReceiver>): Promise<Awaited<ReturnType<AutomationNodeExpectationEvaluator>>> {
  const context = call.args[3];
  const attemptId = context.attemptId;
  if (!attemptId) return invokeAutomationCallback(options, call);
  const fact = { attemptId, source: context.source, declaredCount: call.args[0].length };
  let evaluation: Awaited<ReturnType<AutomationNodeExpectationEvaluator>>;
  try {
    evaluation = await invokeAutomationCallback(options, call);
  } catch (error) {
    AutomationExpectationDiagnostics.record(options, { ...fact, checkedCount: 0, outcome: "unknown" });
    throw error;
  }
  const checkedCount = evaluation?.checkedConditionCount ?? 0;
  const judged = fact.declaredCount > 0 && checkedCount >= fact.declaredCount;
  const outcome = evaluation?.passed === true && judged ? "passed" : evaluation?.passed === false ? "failed" : "unknown";
  AutomationExpectationDiagnostics.record(options, { ...fact, checkedCount, outcome });
  return evaluation;
}
