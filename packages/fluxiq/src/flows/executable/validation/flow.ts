import type { ExecutableFlow } from "../graph/index.ts";
import type { AutomationStudioFlowVariable } from "../interface/index.ts";
import { validateAutomationStudioFlowRegions } from "../regions/index.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";
import { validateFlowInterface } from "./interface.ts";
import { validateFlowValueType, valueMatchesFlowType } from "./value-type.ts";
import { validateExecutableGraph } from "./graph.ts";
import type { ExecutableFlowValidationContext } from "./context.ts";
export type { ExecutableFlowValidationContext } from "./context.ts";

/** Validate the complete execution contract, without project or publication state. */
export function validateExecutableFlow(flow: ExecutableFlow, context: ExecutableFlowValidationContext = {}): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!flow.flowId.trim()) addIssue(issues, "error", "flow.missing_id", "Flow must have a flowId.", "flowId");
  if (!flow.name.trim()) addIssue(issues, "error", "flow.missing_name", "Flow must have a name.", "name");
  if (flow.scope.kind === "domain" && !flow.scope.domainId.trim()) addIssue(issues, "error", "flow.missing_domain_id", "Domain-scoped Flow must have a domainId.", "scope.domainId");
  validateFlowInterface(flow.interface, issues, "interface");
  validateFlowVariables(flow.variables, issues);
  validateFlowErrors(flow.errors, issues);
  issues.push(...validateExecutableGraph(flow, { ...context, requiredSubflowOutputIds: flow.interface.outputs.filter(port => port.required === true).map(port => port.id) }).issues);
  issues.push(...validateAutomationStudioFlowRegions({ ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { handoffs: flow.regionHandoffs } : {}), nodeIds: flow.nodes.map(node => node.id), scope: flow.scope }).issues);
  validateFlowExecutionDefaults(flow, issues);
  return result(issues);
}

function validateFlowVariables(variables: AutomationStudioFlowVariable[], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, variable] of variables.entries()) {
    const path = `variables.${index}`;
    if (!variable.id.trim()) addIssue(issues, "error", "flow.variable_missing_id", "Flow variable must have an id.", `${path}.id`);
    if (!variable.name.trim()) addIssue(issues, "error", "flow.variable_missing_name", "Flow variable must have a name.", `${path}.name`);
    if (ids.has(variable.id)) addIssue(issues, "error", "flow.duplicate_variable_id", `Duplicate Flow variable id "${variable.id}".`, `${path}.id`);
    if (names.has(variable.name)) addIssue(issues, "error", "flow.duplicate_variable_name", `Duplicate Flow variable name "${variable.name}".`, `${path}.name`);
    ids.add(variable.id);
    names.add(variable.name);
    validateFlowValueType(variable.valueType, issues, `${path}.valueType`);
    if (variable.initialValue !== undefined && !valueMatchesFlowType(variable.initialValue, variable.valueType)) {
      addIssue(issues, "error", "flow.variable_initial_type_mismatch", `Initial value for variable "${variable.id}" does not match its declared type.`, `${path}.initialValue`);
    }
  }
}

function validateFlowErrors(errors: ExecutableFlow["errors"], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  for (const [index, error] of errors.entries()) {
    const path = `errors.${index}.id`;
    if (!error.id.trim()) addIssue(issues, "error", "flow.error_missing_id", "Flow error must have an id.", path);
    if (ids.has(error.id)) addIssue(issues, "error", "flow.duplicate_error_id", `Duplicate Flow error id "${error.id}".`, path);
    ids.add(error.id);
  }
}

function validateFlowExecutionDefaults(flow: ExecutableFlow, issues: AutomationStudioValidationIssue[]): void {
  const defaults = flow.executionDefaults;
  if (!defaults) return;
  if (defaults.timeoutMs !== undefined && defaults.timeoutMs <= 0) addIssue(issues, "error", "flow.invalid_timeout", "Flow timeoutMs must be greater than zero.", "executionDefaults.timeoutMs");
  if (defaults.maxConcurrency !== undefined && (!Number.isInteger(defaults.maxConcurrency) || defaults.maxConcurrency <= 0)) {
    addIssue(issues, "error", "flow.invalid_max_concurrency", "Flow maxConcurrency must be a positive integer.", "executionDefaults.maxConcurrency");
  }
  if (defaults.authorizedDomainIds?.some((domainId) => !domainId.trim())) addIssue(issues, "error", "flow.invalid_authorized_domain", "authorizedDomainIds cannot contain empty domain IDs.", "executionDefaults.authorizedDomainIds");
  if (flow.scope.kind !== "global" && defaults.authorizedDomainIds?.length) addIssue(issues, "error", "flow.domain_scope_cross_grant", "Only global Flows may declare authorizedDomainIds.", "executionDefaults.authorizedDomainIds");
}
